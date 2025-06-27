import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// 使用服务角色权限
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// 浏览器兼容的SHA-256哈希函数（服务端版本）
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// 密钥格式定义
const keyPatterns = {
  'OpenAI': [
    { regex: /sk-[a-zA-Z0-9]{48}/g, description: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { regex: /sk-proj-[a-zA-Z0-9]{48}/g, description: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'Anthropic': [
    { regex: /sk-ant-api03-[a-zA-Z0-9_-]{95}/g, description: 'sk-ant-api03-xxxxx...' }
  ],
  'Google AI': [
    { regex: /AIza[0-9A-Za-z_-]{35}/g, description: 'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'Cohere': [
    { regex: /[a-zA-Z0-9]{40}/g, description: '40字符API密钥' }
  ],
  'Hugging Face': [
    { regex: /hf_[a-zA-Z0-9]{34}/g, description: 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'Replicate': [
    { regex: /r8_[a-zA-Z0-9]{40}/g, description: 'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'Azure OpenAI': [
    { regex: /[a-f0-9]{32}/g, description: '32位十六进制密钥' }
  ],
  'AWS Bedrock': [
    { regex: /AKIA[0-9A-Z]{16}/g, description: 'AKIAXXXXXXXXXXXXXXXX' }
  ],
  'Mistral AI': [
    { regex: /[a-zA-Z0-9]{32}/g, description: '32字符API密钥' }
  ],
  'Perplexity AI': [
    { regex: /pplx-[a-zA-Z0-9]{56}/g, description: 'pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'xAI (Grok)': [
    { regex: /xai-[a-zA-Z0-9]{56}/g, description: 'xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'GitHub': [
    { regex: /ghp_[a-zA-Z0-9]{36}/g, description: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { regex: /gho_[a-zA-Z0-9]{36}/g, description: 'gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { regex: /ghu_[a-zA-Z0-9]{36}/g, description: 'ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { regex: /ghs_[a-zA-Z0-9]{36}/g, description: 'ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { regex: /ghr_[a-zA-Z0-9]{36}/g, description: 'ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  ],
  'GitLab': [
    { regex: /glpat-[a-zA-Z0-9_-]{20}/g, description: 'glpat-xxxxxxxxxxxxxxxxxxxx' }
  ]
}

// 验证函数（简化版本）
async function verifyOpenAI(key) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

async function verifyAnthropic(key) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'x-api-key': key,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
    })
    return response.status !== 401 && response.status !== 403
  } catch {
    return false
  }
}

async function verifyGoogle(key) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
    return response.ok
  } catch {
    return false
  }
}

async function verifyHuggingFace(key) {
  try {
    const response = await fetch('https://huggingface.co/api/whoami', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

async function verifyGitHub(key) {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

async function verifyGitLab(key) {
  try {
    const response = await fetch('https://gitlab.com/api/v4/user', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

// 简化的验证函数
async function verifyKey(keyType, key) {
  switch (keyType.toLowerCase()) {
    case 'openai':
      return await verifyOpenAI(key)
    case 'anthropic':
      return await verifyAnthropic(key)
    case 'google ai':
      return await verifyGoogle(key)
    case 'hugging face':
      return await verifyHuggingFace(key)
    case 'github':
      return await verifyGitHub(key)
    case 'gitlab':
      return await verifyGitLab(key)
    default:
      return false // 不支持的类型直接返回false
  }
}

export async function POST(request) {
  try {
    const { 
      importText, 
      selectedService, 
      selectedSeverity, 
      selectedConfidence, 
      sourceUrl, 
      sourceType, 
      autoVerify 
    } = await request.json()

    if (!importText || !selectedService) {
      return Response.json({ error: '缺少必要参数' }, { status: 400 })
    }

    // 提取密钥
    const patterns = keyPatterns[selectedService] || []
    const foundKeys = []
    
    patterns.forEach(pattern => {
      const matches = importText.match(pattern.regex) || []
      matches.forEach(key => {
        if (!foundKeys.some(k => k.key === key)) {
          foundKeys.push({
            key,
            service: selectedService,
            confidence: selectedConfidence,
            severity: selectedSeverity,
            source_url: sourceUrl || null,
            source_type: sourceType
          })
        }
      })
    })

    if (foundKeys.length === 0) {
      return Response.json({
        success: false,
        message: `未在输入内容中找到 ${selectedService} 格式的密钥`,
        total: 0,
        imported: 0,
        duplicates: 0,
        errors: 0,
        verified: 0,
        verificationErrors: 0
      })
    }

    // 批量处理密钥
    let imported = 0
    let duplicates = 0
    let errors = 0
    let verified = 0
    let verificationErrors = 0

    for (const keyData of foundKeys) {
      try {
        const keyHash = hashKey(keyData.key)
        
        // 检查重复
        const { data: existing } = await supabase
          .from('leaked_keys')
          .select('id')
          .eq('key_hash', keyHash)
          .single()

        if (existing) {
          duplicates++
          continue
        }

        // 插入公开密钥信息
        const { data: keyRecord, error } = await supabase
          .from('leaked_keys')
          .insert({
            key_type: keyData.service,
            key_preview: keyData.key.substring(0, 10) + '...',
            key_hash: keyHash,
            confidence: keyData.confidence,
            severity: keyData.severity,
            status: 'unverified',
            source_type: keyData.source_type,
            file_path: keyData.source_url,
            repo_name: null,
            context_preview: `批量导入 - ${keyData.service}`,
            first_seen: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) {
          console.error('插入主表失败:', error)
          errors++
        } else if (keyRecord) {
          // 插入敏感数据表（完整密钥）
          const { error: sensitiveError } = await supabase
            .from('leaked_keys_sensitive')
            .insert({
              key_id: keyRecord.id,
              full_key: keyData.key,
              raw_context: `批量导入来源: ${keyData.source_url || '手动导入'}`,
              github_url: keyData.source_url,
              created_at: new Date().toISOString()
            })

          if (sensitiveError) {
            console.error('插入敏感表失败:', sensitiveError)
            // 删除已插入的主表记录
            await supabase.from('leaked_keys').delete().eq('id', keyRecord.id)
            errors++
          } else {
            imported++
            
            // 如果启用自动验证，直接使用验证逻辑
            if (autoVerify) {
              try {
                const isValid = await verifyKey(keyData.service, keyData.key)
                
                // 更新密钥状态
                await supabase
                  .from('leaked_keys')
                  .update({
                    status: isValid ? 'valid' : 'invalid',
                    last_verified: new Date().toISOString()
                  })
                  .eq('id', keyRecord.id)
                
                verified++
              } catch (error) {
                console.error('自动验证失败:', error)
                verificationErrors++
                // 验证失败不影响导入成功
              }
            }
          }
        }
      } catch (error) {
        console.error('处理密钥失败:', error)
        errors++
      }
    }

    // 记录操作日志
    await supabase.from('access_logs').insert({
      action: 'bulk_import',
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      user_agent: request.headers.get('user-agent')
    })

    return Response.json({
      success: imported > 0,
      message: `批量导入完成`,
      total: foundKeys.length,
      imported,
      duplicates,
      errors,
      verified,
      verificationErrors,
      autoVerifyEnabled: autoVerify
    })

  } catch (error) {
    console.error('批量导入失败:', error)
    return Response.json({ 
      error: '批量导入失败',
      details: error.message,
      success: false
    }, { status: 500 })
  }
}