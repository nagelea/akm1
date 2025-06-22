import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// 密钥模式定义
const KEY_PATTERNS = {
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'OpenAI',
    confidence: 'high'
  },
  openai_project: {
    pattern: /sk-proj-[a-zA-Z0-9_-]{64,}/g,
    name: 'OpenAI Project',
    confidence: 'high'
  },
  openai_user: {
    pattern: /sk-user-[a-zA-Z0-9_-]{64,}/g,
    name: 'OpenAI User',
    confidence: 'high'
  },
  openai_service: {
    pattern: /sk-svcacct-[a-zA-Z0-9_-]{64,}/g,
    name: 'OpenAI Service Account',
    confidence: 'high'
  },
  openai_org: {
    pattern: /org-[a-zA-Z0-9]{24}/g,
    name: 'OpenAI Organization',
    confidence: 'high'
  },
  anthropic: {
    pattern: /sk-ant-api03-[a-zA-Z0-9_-]{95}/g,
    name: 'Anthropic Claude',
    confidence: 'high'
  },
  google: {
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    name: 'Google AI',
    confidence: 'high'
  },
  huggingface: {
    pattern: /hf_[a-zA-Z0-9]{34}/g,
    name: 'HuggingFace',
    confidence: 'high'
  },
  replicate: {
    pattern: /r8_[a-zA-Z0-9]{40}/g,
    name: 'Replicate',
    confidence: 'high'
  },
  groq: {
    pattern: /gsk_[a-zA-Z0-9]{52}/g,
    name: 'Groq',
    confidence: 'high'
  }
}

function extractKeysFromContext(context) {
  const foundKeys = []
  
  for (const [type, config] of Object.entries(KEY_PATTERNS)) {
    const matches = context.match(config.pattern)
    if (matches) {
      for (const key of matches) {
        // 检查是否为假密钥
        if (!isLikelyFakeKey(key, context)) {
          foundKeys.push({
            key,
            type,
            confidence: config.confidence,
            name: config.name
          })
        }
      }
    }
  }
  
  return foundKeys
}

function isLikelyFakeKey(key, context) {
  const fakeIndicators = [
    'example', 'placeholder', 'your-api-key', 'insert_key_here',
    'todo', 'fixme', 'test', 'demo', 'sample', 'fake',
    'xxxxxxx', '123456', 'abcdef', 'replace_me', 'mock',
    'dummy', 'template', 'tutorial', 'guide'
  ]
  
  const keyLower = key.toLowerCase()
  const contextLower = context.toLowerCase()
  
  return fakeIndicators.some(indicator => 
    keyLower.includes(indicator) || 
    contextLower.includes(`${indicator}_key`) ||
    contextLower.includes(`key_${indicator}`)
  )
}

function generateKeyHash(key) {
  // 简单的哈希函数，实际使用中应该使用更安全的方法
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // 转换为32位整数
  }
  return Math.abs(hash).toString(16)
}

function maskKey(key) {
  if (key.length <= 8) return '***'
  const start = key.substring(0, 8)
  const end = key.substring(key.length - 4)
  return `${start}...${end}`
}

export async function POST(request) {
  try {
    const { keyId } = await request.json()
    
    if (!keyId) {
      return Response.json({ error: '缺少keyId参数' }, { status: 400 })
    }
    
    // 获取原始密钥信息
    const { data: originalKey, error: fetchError } = await supabase
      .from('leaked_keys')
      .select(`
        *,
        leaked_keys_sensitive (
          raw_context,
          github_url
        )
      `)
      .eq('id', keyId)
      .single()
    
    if (fetchError || !originalKey) {
      return Response.json({ error: '未找到指定的密钥记录' }, { status: 404 })
    }
    
    const rawContext = originalKey.leaked_keys_sensitive?.[0]?.raw_context
    if (!rawContext) {
      return Response.json({ error: '该密钥没有可用的上下文信息' }, { status: 400 })
    }
    
    // 从上下文中重新提取密钥
    const extractedKeys = extractKeysFromContext(rawContext)
    
    if (extractedKeys.length === 0) {
      return Response.json({ 
        success: true,
        extractedCount: 0,
        message: '未从上下文中发现新的密钥'
      })
    }
    
    let processedCount = 0
    let updatedCount = 0
    let createdCount = 0
    const errors = []
    const results = []
    
    for (const keyInfo of extractedKeys) {
      try {
        const keyHash = generateKeyHash(keyInfo.key)
        
        // 检查密钥是否已存在
        const { data: existingKey } = await supabase
          .from('leaked_keys')
          .select('id, key_hash, key_type, confidence')
          .eq('key_hash', keyHash)
          .single()
        
        if (existingKey) {
          // 检查是否为同一个原始记录的密钥
          if (existingKey.id === keyId) {
            // 是同一个记录，更新信息
            const { error: updateError } = await supabase
              .from('leaked_keys')
              .update({
                key_type: keyInfo.type,
                confidence: keyInfo.confidence,
                status: 'unknown', // 重置验证状态
                last_verified: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', keyId)
            
            if (updateError) {
              errors.push(`更新密钥失败: ${updateError.message}`)
            } else {
              // 更新敏感数据
              await supabase
                .from('leaked_keys_sensitive')
                .update({
                  full_key: keyInfo.key,
                  raw_context: rawContext
                })
                .eq('key_id', keyId)
              
              updatedCount++
              results.push({
                action: 'updated',
                key: maskKey(keyInfo.key),
                type: keyInfo.name,
                id: keyId
              })
            }
          } else {
            // 是不同的记录但相同的密钥，跳过
            results.push({
              action: 'skipped',
              key: maskKey(keyInfo.key),
              type: keyInfo.name,
              reason: '密钥已存在于其他记录中'
            })
          }
          continue
        }
        
        // 创建新的密钥记录（不同的密钥）
        const { data: newKey, error: insertError } = await supabase
          .from('leaked_keys')
          .insert({
            key_type: keyInfo.type,
            key_preview: maskKey(keyInfo.key),
            key_hash: keyHash,
            repo_name: originalKey.repo_name,
            file_path: originalKey.file_path,
            repo_language: originalKey.repo_language,
            severity: originalKey.severity,
            confidence: keyInfo.confidence,
            status: 'unknown',
            context_preview: rawContext.substring(0, 200) + '...',
            first_seen: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single()
        
        if (insertError) {
          errors.push(`插入密钥失败: ${insertError.message}`)
          continue
        }
        
        // 创建敏感数据记录
        const { error: sensitiveError } = await supabase
          .from('leaked_keys_sensitive')
          .insert({
            key_id: newKey.id,
            full_key: keyInfo.key,
            raw_context: rawContext,
            github_url: originalKey.leaked_keys_sensitive?.[0]?.github_url
          })
        
        if (sensitiveError) {
          errors.push(`插入敏感数据失败: ${sensitiveError.message}`)
          // 删除已创建的密钥记录
          await supabase.from('leaked_keys').delete().eq('id', newKey.id)
          continue
        }
        
        createdCount++
        results.push({
          action: 'created',
          key: maskKey(keyInfo.key),
          type: keyInfo.name,
          id: newKey.id
        })
        
      } catch (error) {
        errors.push(`处理密钥失败: ${error.message}`)
      }
    }
    
    processedCount = updatedCount + createdCount
    
    return Response.json({
      success: true,
      extractedCount: processedCount,
      updatedCount: updatedCount,
      createdCount: createdCount,
      totalFound: extractedKeys.length,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `处理完成: 更新 ${updatedCount} 个，新建 ${createdCount} 个密钥`
    })
    
  } catch (error) {
    console.error('Reextract key error:', error)
    return Response.json({
      error: '重新提取失败',
      details: error.message
    }, { status: 500 })
  }
}