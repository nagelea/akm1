import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function DELETE(request) {
  try {
    const { keyId } = await request.json()
    
    if (!keyId) {
      return Response.json({ error: '缺少keyId参数' }, { status: 400 })
    }
    
    // 首先删除访问日志记录（外键约束）
    const { error: logsError } = await supabase
      .from('access_logs')
      .delete()
      .eq('key_id', keyId)
    
    if (logsError) {
      console.error('Failed to delete access logs:', logsError)
      return Response.json({ 
        error: '删除访问日志失败', 
        details: logsError.message 
      }, { status: 500 })
    }
    
    // 然后删除敏感数据记录
    const { error: sensitiveError } = await supabase
      .from('leaked_keys_sensitive')
      .delete()
      .eq('key_id', keyId)
    
    if (sensitiveError) {
      console.error('Failed to delete sensitive data:', sensitiveError)
      return Response.json({ 
        error: '删除敏感数据失败', 
        details: sensitiveError.message 
      }, { status: 500 })
    }
    
    // 最后删除主密钥记录
    const { error: keyError } = await supabase
      .from('leaked_keys')
      .delete()
      .eq('id', keyId)
    
    if (keyError) {
      console.error('Failed to delete key:', keyError)
      return Response.json({ 
        error: '删除密钥记录失败', 
        details: keyError.message 
      }, { status: 500 })
    }
    
    // 记录删除操作
    await supabase.from('access_logs').insert({
      action: 'delete_key',
      key_id: keyId,
      ip_address: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      user_agent: request.headers.get('user-agent')
    })
    
    return Response.json({ 
      success: true,
      message: '密钥删除成功'
    })
    
  } catch (error) {
    console.error('Delete key error:', error)
    return Response.json({
      error: '删除失败',
      details: error.message
    }, { status: 500 })
  }
}