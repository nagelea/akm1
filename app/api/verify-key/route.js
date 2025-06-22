import { createClient } from '@supabase/supabase-js'

// API routes need service key, not the shared client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

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

async function verifyReplicate(key) {
  try {
    const response = await fetch('https://api.replicate.com/v1/account', {
      headers: { 'Authorization': `Token ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

// 验证OpenRouter密钥
async function verifyOpenRouter(key) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

// 验证Together AI密钥
async function verifyTogether(key) {
  try {
    const response = await fetch('https://api.together.xyz/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

async function verifyPerplexity(key) {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      })
    })
    return response.status !== 401 && response.status !== 403
  } catch {
    return false
  }
}

async function verifyGroq(key) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch {
    return false
  }
}

// 从代码上下文提取Azure OpenAI endpoint
function extractAzureEndpoint(context) {
  if (!context) return null
  
  const endpointPatterns = [
    // 直接的https URL
    /https:\/\/[\w-]+\.openai\.azure\.com[^\s"'\)\];,}]*/gi,
    // 环境变量格式
    /AZURE_OPENAI_ENDPOINT["\s]*[:=]["\s]*["'`]?([^"'\s,}\]\)\n]+)/gi,
    /OPENAI_API_BASE["\s]*[:=]["\s]*["'`]?([^"'\s,}\]\)\n]+)/gi,
    // 属性赋值格式
    /endpoint["\s]*[:=]["\s]*["'`]?([^"'\s,}\]\)\n]*\.openai\.azure\.com[^"'\s,}\]\)\n]*)/gi,
    /base_url["\s]*[:=]["\s]*["'`]?([^"'\s,}\]\)\n]*\.openai\.azure\.com[^"'\s,}\]\)\n]*)/gi,
    /api_base["\s]*[:=]["\s]*["'`]?([^"'\s,}\]\)\n]*\.openai\.azure\.com[^"'\s,}\]\)\n]*)/gi,
    // 字符串形式
    /"[^"]*\.openai\.azure\.com[^"]*"/gi,
    /'[^']*\.openai\.azure\.com[^']*'/gi
  ]
  
  for (const pattern of endpointPatterns) {
    const matches = [...context.matchAll(pattern)]
    if (matches.length > 0) {
      for (const match of matches) {
        let endpoint = match[1] || match[0]
        // 清理引号和空格
        endpoint = endpoint.replace(/^["'`\s]|["'`\s]$/g, '')
        
        // 验证是否为有效的Azure OpenAI endpoint
        if (endpoint.includes('.openai.azure.com') && endpoint.startsWith('https://')) {
          return endpoint.replace(/\/$/, '') // 移除末尾斜杠
        }
      }
    }
  }
  
  return null
}

// 验证Azure OpenAI密钥
async function verifyAzureOpenAI(key, context = null) {
  try {
    // 检查密钥格式（Azure OpenAI密钥通常是32位字符串）
    if (!key || key.length < 16) {
      return false
    }
    
    // 尝试从上下文提取endpoint
    const endpoint = extractAzureEndpoint(context)
    
    if (!endpoint) {
      console.log('Azure OpenAI: No endpoint found in context, skipping verification')
      return false
    }
    
    console.log(`Azure OpenAI: Trying endpoint ${endpoint}`)
    
    // 尝试调用models API
    const modelsUrl = `${endpoint}/openai/models?api-version=2023-12-01-preview`
    const response = await fetch(modelsUrl, {
      headers: { 
        'api-key': key,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    })
    
    // Azure OpenAI 成功的响应码
    if (response.ok) {
      console.log('Azure OpenAI: Verification successful')
      return true
    }
    
    // 如果是401或403，说明密钥无效
    if (response.status === 401 || response.status === 403) {
      console.log('Azure OpenAI: Invalid key (401/403)')
      return false
    }
    
    // 其他错误可能是网络或配置问题，返回false但不确定
    console.log(`Azure OpenAI: Unexpected response ${response.status}`)
    return false
    
  } catch (error) {
    console.log('Azure OpenAI: Verification error:', error.message)
    return false
  }
}

// 验证Google Vertex AI密钥
async function verifyVertexAI(key) {
  try {
    // Vertex AI 可以使用Google Cloud API密钥或服务账户
    // 尝试使用Google AI API (新的Gemini API)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
    return response.ok
  } catch {
    return false
  }
}

// 验证Cohere密钥
async function verifyCohere(key) {
  try {
    const response = await fetch('https://api.cohere.ai/v1/models', {
      headers: { 
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    })
    return response.ok
  } catch {
    return false
  }
}

// 验证Mistral密钥
async function verifyMistral(key) {
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: { 
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    })
    return response.ok
  } catch {
    return false
  }
}

export async function POST(request) {
  try {
    const { keyType, key, keyId } = await request.json()

    if (!key || !keyType) {
      return Response.json({ error: '缺少必要参数' }, { status: 400 })
    }

    let isValid = false
    let context = null
    
    // 如果提供了keyId，尝试获取上下文信息（仅限Azure OpenAI）
    if (keyId && keyType.toLowerCase() === 'azure_openai') {
      try {
        const { data: keyData } = await supabase
          .from('leaked_keys')
          .select('leaked_keys_sensitive(raw_context)')
          .eq('id', keyId)
          .single()
        
        if (keyData?.leaked_keys_sensitive?.raw_context) {
          context = keyData.leaked_keys_sensitive.raw_context
        }
      } catch (error) {
        console.log('Failed to fetch context for Azure OpenAI:', error.message)
      }
    }

    // 根据密钥类型选择验证方法
    switch (keyType.toLowerCase()) {
      case 'openai':
      case 'openai_org':
      case 'openai_project':
      case 'openai_user':
      case 'deepseek':
        isValid = await verifyOpenAI(key)
        break
      case 'anthropic':
        isValid = await verifyAnthropic(key)
        break
      case 'openrouter':
        isValid = await verifyOpenRouter(key)
        break
      case 'perplexity':
        isValid = await verifyPerplexity(key)
        break
      case 'groq':
        isValid = await verifyGroq(key)
        break
      case 'together':
        isValid = await verifyTogether(key)
        break
      case 'google':
      case 'google_service':
      case 'palm':
      case 'gemini':
        isValid = await verifyGoogle(key)
        break
      case 'huggingface':
        isValid = await verifyHuggingFace(key)
        break
      case 'replicate':
        isValid = await verifyReplicate(key)
        break
      case 'stability':
        isValid = await verifyOpenAI(key) // Stability API类似OpenAI
        break
      case 'azure_openai':
        // Azure OpenAI 使用上下文提取endpoint
        isValid = await verifyAzureOpenAI(key, context)
        break
      case 'vertex_ai':
        isValid = await verifyVertexAI(key)
        break
      case 'cohere':
        isValid = await verifyCohere(key)
        break
      case 'mistral':
        isValid = await verifyMistral(key)
        break
      case 'fireworks':
      case 'anyscale':
      case 'voyage':
      case 'elevenlabs':
      case 'runpod':
        // 这些服务暂时标记为无法验证
        return Response.json({ 
          isValid: false,
          message: '暂不支持该服务的自动验证',
          keyType 
        })
      default:
        return Response.json({ 
          error: '不支持的密钥类型',
          isValid: false 
        }, { status: 400 })
    }

    // 记录验证操作
    await supabase.from('access_logs').insert({
      action: 'verify_key_api',
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      user_agent: request.headers.get('user-agent')
    })

    return Response.json({ 
      success: true,
      isValid,
      keyType,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Key verification error:', error)
    return Response.json({ 
      error: '验证失败',
      details: error.message,
      isValid: false
    }, { status: 500 })
  }
}