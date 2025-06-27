import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用 service role key 进行数据库操作
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables for IP analytics')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// IP地理位置解析 (使用免费的 ip-api.com)
async function getIPLocation(ip) {
  if (ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return {
      country: 'Local',
      city: 'Local',
      region: 'Local',
      timezone: 'Local',
      isp: 'Local Network',
      org: 'Private'
    }
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,timezone,isp,org,query`, {
      timeout: 5000
    })
    
    if (!response.ok) throw new Error('API request failed')
    
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
    
    throw new Error('Location lookup failed')
  } catch (error) {
    console.error('IP location lookup failed:', error)
    return {
      country: 'Unknown',
      countryCode: 'XX',
      region: 'Unknown',
      city: 'Unknown',
      timezone: 'Unknown',
      isp: 'Unknown',
      org: 'Unknown'
    }
  }
}

// IP风险评估
function assessIPRisk(stats) {
  let riskScore = 0
  let riskFactors = []

  // 访问频率风险
  if (stats.visit_count > 100) {
    riskScore += 30
    riskFactors.push('高频访问')
  } else if (stats.visit_count > 50) {
    riskScore += 15
    riskFactors.push('频繁访问')
  }

  // 时间分布风险
  const hourSpan = stats.hour_span || 0
  if (hourSpan > 20) {
    riskScore += 20
    riskFactors.push('24小时活跃')
  } else if (hourSpan > 12) {
    riskScore += 10
    riskFactors.push('长时间活跃')
  }

  // 页面覆盖风险
  if (stats.unique_pages > 20) {
    riskScore += 25
    riskFactors.push('广泛扫描')
  } else if (stats.unique_pages > 10) {
    riskScore += 10
    riskFactors.push('多页访问')
  }

  // 会话异常
  if (stats.avg_session_duration < 5) {
    riskScore += 15
    riskFactors.push('快速浏览')
  }

  // 确定风险等级
  let riskLevel = 'low'
  if (riskScore >= 50) riskLevel = 'high'
  else if (riskScore >= 25) riskLevel = 'medium'

  return {
    score: riskScore,
    level: riskLevel,
    factors: riskFactors
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'summary'
    const days = parseInt(searchParams.get('days')) || 7
    const limit = parseInt(searchParams.get('limit')) || 50

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    switch (type) {
      case 'summary':
        // IP统计概览
        const { data: summaryData, error: summaryError } = await supabase
          .rpc('get_ip_analytics_summary', { days_back: days })

        if (summaryError) {
          console.error('Summary error:', summaryError)
          return NextResponse.json({})
        }
        return NextResponse.json(summaryData?.[0] || {})

      case 'top-ips':
        // 最活跃IP地址
        const { data: topIPs, error: topError } = await supabase
          .from('visitor_stats')
          .select('ip_address, country, city')
          .gte('created_at', startDate.toISOString())
          .not('ip_address', 'is', null)

        if (topError) {
          console.error('Top IPs error:', topError)
          return NextResponse.json([])
        }

        // 统计每个IP的访问情况
        const ipStats = {}
        topIPs.forEach(visit => {
          const ip = visit.ip_address
          if (!ipStats[ip]) {
            ipStats[ip] = {
              ip: ip,
              visit_count: 0,
              country: visit.country || 'Unknown',
              city: visit.city || 'Unknown',
              first_seen: visit.created_at,
              last_seen: visit.created_at
            }
          }
          ipStats[ip].visit_count++
        })

        // 排序并限制结果
        const sortedIPs = Object.values(ipStats)
          .sort((a, b) => b.visit_count - a.visit_count)
          .slice(0, limit)

        return NextResponse.json(sortedIPs)

      case 'geographic':
        // 地理分布统计
        const { data: geoData, error: geoError } = await supabase
          .from('visitor_stats')
          .select('country, city, ip_address')
          .gte('created_at', startDate.toISOString())
          .not('country', 'is', null)

        if (geoError) throw geoError

        const countryStats = {}
        const cityStats = {}

        geoData.forEach(visit => {
          const country = visit.country || 'Unknown'
          const city = visit.city || 'Unknown'

          countryStats[country] = (countryStats[country] || 0) + 1
          cityStats[`${city}, ${country}`] = (cityStats[`${city}, ${country}`] || 0) + 1
        })

        return NextResponse.json({
          countries: Object.entries(countryStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 20)
            .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {}),
          cities: Object.entries(cityStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 30)
            .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {})
        })

      case 'risk-analysis':
        // IP风险分析
        const { data: riskData, error: riskError } = await supabase
          .rpc('get_ip_risk_analysis', { days_back: days, ip_limit: limit })

        if (riskError) {
          console.error('Risk analysis error:', riskError)
          return NextResponse.json([])
        }

        // 确保返回数组，为每个IP添加风险评估
        const safeRiskData = Array.isArray(riskData) ? riskData : []
        const riskAnalysis = safeRiskData.map(ip => ({
          ...ip,
          risk: assessIPRisk(ip)
        }))

        return NextResponse.json(riskAnalysis)

      case 'hourly-distribution':
        // 24小时访问分布
        const { data: hourlyData, error: hourlyError } = await supabase
          .from('visitor_stats')
          .select('created_at, ip_address')
          .gte('created_at', startDate.toISOString())

        if (hourlyError) throw hourlyError

        const hourlyStats = Array(24).fill(0).map(() => ({ visits: 0, unique_ips: new Set() }))

        hourlyData.forEach(visit => {
          const hour = new Date(visit.created_at).getHours()
          hourlyStats[hour].visits++
          hourlyStats[hour].unique_ips.add(visit.ip_address)
        })

        const hourlyResult = hourlyStats.map((stat, hour) => ({
          hour,
          visits: stat.visits,
          unique_ips: stat.unique_ips.size
        }))

        return NextResponse.json(hourlyResult)

      case 'ip-details':
        // 特定IP详细信息
        const targetIP = searchParams.get('ip')
        if (!targetIP) {
          return NextResponse.json({ error: 'IP address required' }, { status: 400 })
        }

        const { data: ipDetails, error: detailsError } = await supabase
          .from('visitor_stats')
          .select('*')
          .eq('ip_address', targetIP)
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false })

        if (detailsError) throw detailsError

        if (ipDetails.length === 0) {
          return NextResponse.json({ error: 'IP not found' }, { status: 404 })
        }

        // 获取IP地理位置信息
        const locationInfo = await getIPLocation(targetIP)

        // 计算统计信息
        const uniquePages = new Set(ipDetails.map(v => v.page_path)).size
        const totalVisits = ipDetails.length
        const avgSessionDuration = ipDetails.reduce((sum, v) => sum + (v.session_duration || 0), 0) / totalVisits
        const visitDates = ipDetails.map(v => new Date(v.created_at).toDateString())
        const uniqueDays = new Set(visitDates).size

        const ipInfo = {
          ip: targetIP,
          location: locationInfo,
          stats: {
            total_visits: totalVisits,
            unique_pages: uniquePages,
            unique_days: uniqueDays,
            avg_session_duration: Math.round(avgSessionDuration),
            first_visit: ipDetails[ipDetails.length - 1].created_at,
            last_visit: ipDetails[0].created_at,
            browsers: [...new Set(ipDetails.map(v => v.browser))],
            devices: [...new Set(ipDetails.map(v => v.device_type))],
            operating_systems: [...new Set(ipDetails.map(v => v.os))]
          },
          risk: assessIPRisk({
            visit_count: totalVisits,
            unique_pages: uniquePages,
            avg_session_duration: avgSessionDuration,
            hour_span: 24 // 简化计算
          }),
          recent_visits: ipDetails.slice(0, 20)
        }

        return NextResponse.json(ipInfo)

      case 'resolve-locations':
        // 解析IP地理位置
        const { data: ipsToResolve, error: resolveError } = await supabase
          .from('visitor_stats')
          .select('ip_address')
          .is('country', null)
          .not('ip_address', 'is', null)
          .neq('ip_address', '127.0.0.1')
          .limit(limit)

        if (resolveError) throw resolveError

        const uniqueIPs = [...new Set(ipsToResolve.map(item => item.ip_address))]
        let updatedCount = 0

        for (const ip of uniqueIPs) {
          try {
            console.log(`正在解析 IP: ${ip}`)
            const location = await getIPLocation(ip)
            console.log(`IP ${ip} 解析结果:`, location)
            
            if (location && location.country !== 'Unknown') {
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
                console.error(`更新 IP ${ip} 失败:`, updateError)
              } else {
                console.log(`✅ IP ${ip} 更新成功，影响 ${updateResult.length} 条记录`)
                updatedCount++
              }
            } else {
              console.log(`⚠️ IP ${ip} 解析失败或返回Unknown`)
            }
            // 添加延迟避免API限流
            await new Promise(resolve => setTimeout(resolve, 200))
          } catch (error) {
            console.error(`Failed to resolve location for IP ${ip}:`, error)
          }
        }

        return NextResponse.json({
          message: `Updated location for ${updatedCount} IP addresses`,
          processed: uniqueIPs.length,
          updated: updatedCount
        })

      default:
        return NextResponse.json({ error: 'Invalid analysis type' }, { status: 400 })
    }

  } catch (error) {
    console.error('IP Analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch IP analytics' },
      { status: 500 }
    )
  }
}