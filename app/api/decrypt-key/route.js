import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// API routes need service key, not the shared client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production'
const ALGORITHM = 'aes-256-gcm'

function decryptData(encryptedData) {
  try {
    const data = JSON.parse(encryptedData)
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const iv = Buffer.from(data.iv, 'hex')
    const decipher = crypto.createDecipherGCM(ALGORITHM, key, iv)
    
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'))
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    throw new Error('解密失败: ' + error.message)
  }
}

export async function POST(request) {
  try {
    const { keyId, encryptedData } = await request.json()

    // 验证用户权限
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return Response.json({ error: '未授权访问' }, { status: 401 })
    }

    // 这里应该验证JWT token和管理员权限
    // 简化版本，实际应用中需要更严格的验证
    
    // 解密密钥
    const decryptedKey = decryptData(encryptedData)

    // 记录解密操作
    await supabase.from('access_logs').insert({
      action: 'decrypt_key',
      key_id: keyId,
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      user_agent: request.headers.get('user-agent')
    })

    return Response.json({ 
      success: true, 
      decryptedKey 
    })

  } catch (error) {
    console.error('Decryption API error:', error)
    return Response.json({ 
      error: '解密失败',
      details: error.message 
    }, { status: 500 })
  }
}