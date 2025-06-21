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
      case 'stability':
        isValid = await verifyOpenAI(key)
        break
      case 'anthropic':
        isValid = await verifyAnthropic(key)
        break
      case 'google':
      case 'google_service':
      case 'palm':
        isValid = await verifyGoogle(key)
        break
      case 'huggingface':
        isValid = await verifyHuggingFace(key)
        break
      case 'replicate':
        isValid = await verifyReplicate(key)
        break
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