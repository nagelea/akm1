import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// 密钥模式定义
const KEY_PATTERNS = {
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}/,
    name: 'OpenAI',
    confidence: 'high'
  },
  openai_project: {
    pattern: /sk-proj-[a-zA-Z0-9_-]{64,}/,
    name: 'OpenAI Project',
    confidence: 'high'
  },
  openai_user: {
    pattern: /sk-user-[a-zA-Z0-9_-]{64,}/,
    name: 'OpenAI User',
    confidence: 'high'
  },
  openai_service: {
    pattern: /sk-svcacct-[a-zA-Z0-9_-]{64,}/,
    name: 'OpenAI Service Account',
    confidence: 'high'
  },
  openai_org: {
    pattern: /org-[a-zA-Z0-9]{24}/,
    name: 'OpenAI Organization',
    confidence: 'high'
  },
  anthropic: {
    pattern: /sk-ant-api03-[a-zA-Z0-9_-]{95}/,
    name: 'Anthropic Claude',
    confidence: 'high'
  },
  google: {
    pattern: /AIza[a-zA-Z0-9_-]{35}/,
    name: 'Google AI',
    confidence: 'high'
  },
  huggingface: {
    pattern: /hf_[a-zA-Z0-9]{34}/,
    name: 'HuggingFace',
    confidence: 'high'
  },
  replicate: {
    pattern: /r8_[a-zA-Z0-9]{40}/,
    name: 'Replicate',
    confidence: 'high'
  },
  groq: {
    pattern: /gsk_[a-zA-Z0-9]{52}/,
    name: 'Groq',
    confidence: 'high'
  },
  openrouter: {
    pattern: /sk-or-v1-[a-zA-Z0-9]{64}/,
    name: 'OpenRouter',
    confidence: 'high'
  },
  perplexity: {
    pattern: /pplx-[a-zA-Z0-9]{56}/,
    name: 'Perplexity',
    confidence: 'high'
  }
}

function detectKeyType(key) {
  for (const [type, config] of Object.entries(KEY_PATTERNS)) {
    if (config.pattern.test(key)) {
      return {
        type,
        name: config.name,
        confidence: config.confidence
      }
    }
  }
  
  // 如果没有匹配到已知模式，尝试通用检测
  if (key.startsWith('sk-') && key.length > 20) {
    return {
      type: 'openai',
      name: 'OpenAI (Generic)',
      confidence: 'medium'
    }
  }
  
  return {
    type: 'unknown',
    name: 'Unknown API Key',
    confidence: 'low'
  }
}

function generateKeyHash(key) {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

function maskKey(key) {
  if (key.length <= 8) return '***'
  const start = key.substring(0, 8)
  const end = key.substring(key.length - 4)
  return `${start}...${end}`
}

function assessSeverity(keyType, confidence) {
  // 基于密钥类型和置信度评估严重性
  const highRiskTypes = ['openai', 'openai_project', 'openai_user', 'openai_service', 'anthropic']
  const mediumRiskTypes = ['google', 'huggingface', 'replicate', 'groq']
  
  if (highRiskTypes.includes(keyType) && confidence === 'high') {
    return 'high'
  } else if (mediumRiskTypes.includes(keyType) || confidence === 'medium') {
    return 'medium'
  } else {
    return 'low'
  }
}

export async function POST(request) {
  try {
    const { keyId, extractedKeys, originalContext } = await request.json()
    
    if (!keyId || !extractedKeys) {
      return Response.json({ error: '缺少必要参数' }, { status: 400 })
    }
    
    // 获取原始密钥信息
    const { data: originalKey, error: fetchError } = await supabase
      .from('leaked_keys')
      .select('*')
      .eq('id', keyId)
      .single()
    
    if (fetchError || !originalKey) {
      return Response.json({ error: '未找到指定的密钥记录' }, { status: 404 })
    }
    
    // 解析输入的密钥（每行一个）
    const keyLines = extractedKeys.split('\\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
    
    if (keyLines.length === 0) {
      return Response.json({ error: '未提供有效的密钥' }, { status: 400 })
    }
    
    let processedCount = 0
    const results = []
    const errors = []
    
    for (const key of keyLines) {
      try {
        // 检测密钥类型
        const keyInfo = detectKeyType(key)
        const keyHash = generateKeyHash(key)
        
        // 检查密钥是否已存在
        const { data: existingKey } = await supabase
          .from('leaked_keys')
          .select('id')
          .eq('key_hash', keyHash)
          .single()
        
        if (existingKey) {
          results.push({
            key: maskKey(key),
            status: 'duplicate',
            message: '密钥已存在'
          })
          continue
        }
        
        // 评估严重性
        const severity = assessSeverity(keyInfo.type, keyInfo.confidence)
        
        // 创建新的密钥记录
        const { data: newKey, error: insertError } = await supabase
          .from('leaked_keys')
          .insert({
            key_type: keyInfo.type,
            key_preview: maskKey(key),
            key_hash: keyHash,
            repo_name: originalKey.repo_name,
            file_path: originalKey.file_path,
            repo_language: originalKey.repo_language,
            severity: severity,
            confidence: keyInfo.confidence,
            status: 'unknown',
            context_preview: originalContext ? originalContext.substring(0, 200) + '...' : 'Manual extraction',
            first_seen: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single()
        
        if (insertError) {
          errors.push(`插入密钥 ${maskKey(key)} 失败: ${insertError.message}`)
          results.push({
            key: maskKey(key),
            status: 'error',
            message: insertError.message
          })
          continue
        }
        
        // 创建敏感数据记录
        const { error: sensitiveError } = await supabase
          .from('leaked_keys_sensitive')
          .insert({
            key_id: newKey.id,
            full_key: key,
            raw_context: originalContext || 'Manual extraction',
            github_url: null
          })
        
        if (sensitiveError) {
          errors.push(`插入敏感数据 ${maskKey(key)} 失败: ${sensitiveError.message}`)
          // 删除已创建的密钥记录
          await supabase.from('leaked_keys').delete().eq('id', newKey.id)
          results.push({
            key: maskKey(key),
            status: 'error',
            message: sensitiveError.message
          })
          continue
        }
        
        processedCount++
        results.push({
          key: maskKey(key),
          type: keyInfo.name,
          confidence: keyInfo.confidence,
          severity: severity,
          status: 'success',
          id: newKey.id
        })
        
      } catch (error) {
        errors.push(`处理密钥 ${maskKey(key)} 失败: ${error.message}`)
        results.push({
          key: maskKey(key),
          status: 'error',
          message: error.message
        })
      }
    }
    
    return Response.json({
      success: true,
      processedCount,
      totalSubmitted: keyLines.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: `成功处理 ${processedCount}/${keyLines.length} 个密钥`
    })
    
  } catch (error) {
    console.error('Manual extract error:', error)
    return Response.json({
      error: '手工提取失败',
      details: error.message
    }, { status: 500 })
  }
}