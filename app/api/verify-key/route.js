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

// 添加新的验证函数
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
      case 'fireworks':
      case 'anyscale':
      case 'voyage':
      case 'together':
      case 'cohere':
      case 'elevenlabs':
      case 'runpod':
      case 'azure_openai':
      case 'mistral':
      case 'vertex_ai':
        // 这些服务需要特殊验证方法，暂时标记为无法验证
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