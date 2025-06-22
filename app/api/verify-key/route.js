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

// 验证Azure OpenAI密钥
async function verifyAzureOpenAI(key) {
  try {
    // Azure OpenAI 密钥通常以特定格式开头，但需要endpoint才能验证
    // 尝试一些通用的验证方法，但不保证100%准确
    
    // 检查密钥格式（Azure OpenAI密钥通常是32位十六进制字符串）
    if (!/^[a-f0-9]{32}$/i.test(key)) {
      return false
    }
    
    // 由于没有endpoint，先返回false，表示需要手动验证
    // 后续可以改进为从数据库中获取endpoint信息
    return false
  } catch {
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
    const { keyType, key } = await request.json()

    if (!key || !keyType) {
      return Response.json({ error: '缺少必要参数' }, { status: 400 })
    }

    let isValid = false

    // 根据密钥类型选择验证方法
    switch (keyType.toLowerCase()) {
      case 'openai':
      case 'openai_org':
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
        // Azure OpenAI 需要特殊处理，因为需要endpoint
        // 暂时尝试通用验证，实际使用时可能需要endpoint信息
        isValid = await verifyAzureOpenAI(key)
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