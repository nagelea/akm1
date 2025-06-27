import { NextResponse } from 'next/server'
import supabase from '../../../lib/supabase'
import crypto from 'crypto'

// IP地理位置解析
async function getIPLocation(ip) {
  try {
    // 跳过本地IP
    if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return null
    }
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,timezone,isp,org`, {
      timeout: 5000
    })
    
    if (!response.ok) throw new Error('IP API request failed')
    
    const data = await response.json()
    
    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        region: data.regionName || 'Unknown',
        city: data.city || 'Unknown',
        timezone: data.timezone || 'Unknown',
        isp: data.isp || 'Unknown',
        org: data.org || 'Unknown'
      }
    }
    
    return null
  } catch (error) {
    console.error('IP location lookup failed:', error)
    return null
  }
}

// 获取客户端IP地址
function getClientIP(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  if (realIP) {
    return realIP
  }
  return '127.0.0.1'
}

// 解析User Agent信息
function parseUserAgent(userAgent) {
  const ua = userAgent || ''
  
  // 检测设备类型
  let deviceType = 'desktop'
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    deviceType = /iPad/i.test(ua) ? 'tablet' : 'mobile'
  }
  
  // 检测浏览器
  let browser = 'Unknown'
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'  
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Edg')) browser = 'Edge'
  
  // 检测操作系统
  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iOS')) os = 'iOS'
  
  return { deviceType, browser, os }
}

// 生成访客唯一标识
function generateVisitorId(ip, userAgent) {
  const data = `${ip}-${userAgent}`
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32)
}

// 记录访问统计
export async function POST(request) {
  try {
    const body = await request.json()
    const { 
      pagePath, 
      referrer, 
      screenResolution,
      sessionDuration = 0
    } = body
    
    const ip = getClientIP(request)
    const userAgent = request.headers.get('user-agent') || ''
    const visitorId = generateVisitorId(ip, userAgent)
    const { deviceType, browser, os } = parseUserAgent(userAgent)
    
    // 检查是否是新IP，如果是则尝试获取地理位置
    let locationData = {}
    
    const { data: existingIP, error: checkError } = await supabase
      .from('visitor_stats')
      .select('country')
      .eq('ip_address', ip)
      .not('country', 'is', null)
      .limit(1)
    
    if (!checkError && (!existingIP || existingIP.length === 0)) {
      // 这是新IP或者之前没有地理位置数据，尝试解析
      const location = await getIPLocation(ip)
      if (location) {
        locationData = {
          country: location.country,
          city: location.city
        }
      }
    }
    
    // 插入访问记录
    const { error: insertError } = await supabase
      .from('visitor_stats')
      .insert({
        visitor_id: visitorId,
        ip_address: ip,
        user_agent: userAgent,
        page_path: pagePath,
        referrer: referrer || null,
        device_type: deviceType,
        browser: browser,
        os: os,
        screen_resolution: screenResolution || null,
        session_duration: sessionDuration,
        ...locationData
      })
    
    if (insertError) {
      console.error('Error inserting visitor stats:', insertError)
    }
    
    // 更新在线用户状态
    const { error: upsertError } = await supabase
      .from('online_users')
      .upsert({
        visitor_id: visitorId,
        page_path: pagePath,
        last_active: new Date().toISOString()
      }, {
        onConflict: 'visitor_id'
      })
    
    if (upsertError) {
      console.error('Error updating online users:', upsertError)
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Analytics tracking error:', error)
    return NextResponse.json(
      { error: 'Failed to track analytics' },
      { status: 500 }
    )
  }
}

// 获取统计数据
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'summary'
    const days = parseInt(searchParams.get('days')) || 7
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    switch (type) {
      case 'summary':
        // 获取概览统计
        const { data: summaryData, error: summaryError } = await supabase
          .rpc('get_analytics_summary', { days_back: days })
        
        if (summaryError) throw summaryError
        return NextResponse.json(summaryData[0] || {})
        
      case 'daily':
        // 获取每日统计
        const { data: dailyData, error: dailyError } = await supabase
          .from('daily_stats')
          .select('*')
          .gte('date', startDate.toISOString().split('T')[0])
          .order('date', { ascending: true })
        
        if (dailyError) throw dailyError
        return NextResponse.json(dailyData)
        
      case 'pages':
        // 获取页面统计
        const { data: pageData, error: pageError } = await supabase
          .from('visitor_stats')
          .select('page_path')
          .gte('created_at', startDate.toISOString())
        
        if (pageError) throw pageError
        
        const pageStats = pageData.reduce((acc, item) => {
          acc[item.page_path] = (acc[item.page_path] || 0) + 1
          return acc
        }, {})
        
        return NextResponse.json(pageStats)
        
      case 'online':
        // 获取当前在线用户数
        const { count, error: onlineError } = await supabase
          .from('online_users')
          .select('*', { count: 'exact', head: true })
          .gte('last_active', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        
        if (onlineError) throw onlineError
        return NextResponse.json({ online: count || 0 })
        
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('Analytics fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}