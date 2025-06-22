import { createClient } from '@supabase/supabase-js'

// API routes need service key, not the shared client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
  try {
    const { keyId, status, lastVerified } = await request.json()

    if (!keyId || !status) {
      return Response.json({ error: '缺少必要参数' }, { status: 400 })
    }

    console.log(`Updating key ${keyId} to status ${status}`)

    // 使用服务密钥更新状态
    const { data, error } = await supabase
      .from('leaked_keys')
      .update({ 
        status: status,
        last_verified: lastVerified || new Date().toISOString()
      })
      .eq('id', keyId)
      .select()

    if (error) {
      console.error('Update error:', error)
      return Response.json({ 
        error: '更新失败',
        details: error.message 
      }, { status: 500 })
    }

    console.log('Update successful:', data)

    // 记录操作日志
    await supabase.from('access_logs').insert({
      action: 'update_key_status',
      key_id: keyId,
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      user_agent: request.headers.get('user-agent')
    })

    return Response.json({ 
      success: true,
      data: data,
      message: '状态更新成功'
    })

  } catch (error) {
    console.error('Update key status error:', error)
    return Response.json({ 
      error: '更新失败',
      details: error.message
    }, { status: 500 })
  }
}