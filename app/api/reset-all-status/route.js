import { createClient } from '@supabase/supabase-js'

// API routes need service key, not the shared client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
  try {
    console.log('Resetting all key statuses to unknown')

    // 使用服务密钥重置所有状态
    const { data, error } = await supabase
      .from('leaked_keys')
      .update({ 
        status: 'unknown',
        last_verified: null
      })
      .neq('id', 0) // 更新所有记录（id不等于0，实际上所有记录都满足条件）
      .select('id')

    if (error) {
      console.error('Reset error:', error)
      return Response.json({ 
        error: '重置失败',
        details: error.message 
      }, { status: 500 })
    }

    console.log(`Reset successful: ${data?.length || 0} records updated`)

    // 记录操作日志
    await supabase.from('access_logs').insert({
      action: 'reset_all_status',
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      user_agent: request.headers.get('user-agent')
    })

    return Response.json({ 
      success: true,
      count: data?.length || 0,
      message: `已重置 ${data?.length || 0} 条记录的状态`
    })

  } catch (error) {
    console.error('Reset all status error:', error)
    return Response.json({ 
      error: '重置失败',
      details: error.message
    }, { status: 500 })
  }
}