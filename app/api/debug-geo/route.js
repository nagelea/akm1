import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// IP地理位置解析
async function getIPLocation(ip) {
  try {
    if (ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return { skip: true, reason: 'Local IP' }
    }
    
    console.log(`正在解析 IP: ${ip}`)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,timezone,isp,org`, {
      timeout: 10000
    })
    
    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }
    
    const data = await response.json()
    console.log(`API 返回 (${ip}):`, data)
    
    if (data.status === 'success') {
      return {
        success: true,
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        region: data.regionName || 'Unknown',
        city: data.city || 'Unknown',
        timezone: data.timezone || 'Unknown',
        isp: data.isp || 'Unknown',
        org: data.org || 'Unknown'
      }
    }
    
    return { error: data.message || 'API failed', status: data.status }
  } catch (error) {
    return { error: error.message }
  }
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. 查找需要解析的IP
    const { data: ipsToResolve, error: queryError } = await supabase
      .from('visitor_stats')
      .select('ip_address, created_at')
      .is('country', null)
      .not('ip_address', 'is', null)
      .neq('ip_address', '127.0.0.1')
      .limit(3)

    if (queryError) {
      return NextResponse.json({ error: 'Query failed', details: queryError })
    }

    const uniqueIPs = [...new Set(ipsToResolve.map(item => item.ip_address))]
    console.log('Found IPs to resolve:', uniqueIPs)

    const results = []

    // 2. 逐个测试解析
    for (const ip of uniqueIPs) {
      const result = { ip }
      
      // 解析地理位置
      const location = await getIPLocation(ip)
      result.geoResult = location
      
      if (location.success && location.country !== 'Unknown') {
        // 尝试更新数据库
        const { data: updateResult, error: updateError } = await supabase
          .from('visitor_stats')
          .update({
            country: location.country,
            city: location.city,
            region: location.region,
            timezone: location.timezone
          })
          .eq('ip_address', ip)
          .is('country', null)
          .select('id')

        if (updateError) {
          result.updateError = updateError
          result.updateSuccess = false
        } else {
          result.updateSuccess = true
          result.updatedRecords = updateResult.length
        }
      } else {
        result.updateSkipped = true
        result.reason = location.error || location.reason || 'Geo lookup failed'
      }
      
      results.push(result)
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      totalIPs: uniqueIPs.length,
      results: results,
      summary: {
        successful: results.filter(r => r.updateSuccess).length,
        failed: results.filter(r => r.updateError).length,
        skipped: results.filter(r => r.updateSkipped).length
      }
    })

  } catch (error) {
    console.error('Debug geo failed:', error)
    return NextResponse.json({ 
      error: 'Debug exception', 
      message: error.message 
    })
  }
}