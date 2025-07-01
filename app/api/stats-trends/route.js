import { createClient } from '@supabase/supabase-js'

// API routes need service key, not the shared client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function GET() {
  try {
    console.log('Calculating stats trends...')

    // 获取当前时间点 - 使用UTC时间确保一致性
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)
    
    console.log('时间范围:', {
      today: today.toISOString(),
      yesterday: yesterday.toISOString(), 
      weekAgo: weekAgo.toISOString(),
      twoWeeksAgo: twoWeeksAgo.toISOString()
    })

    // 获取所有密钥数据 - 使用正确的时间字段first_seen
    const { data: allKeys, error, count } = await supabase
      .from('leaked_keys')
      .select('first_seen, severity', { count: 'exact' })

    if (error) {
      throw new Error('获取密钥数据失败: ' + error.message)
    }

    // 记录查询结果
    console.log(`✅ Retrieved ${allKeys?.length || 0} keys from database (total count: ${count})`)
    
    // 按时间分组统计
    const stats = {
      total: count || allKeys?.length || 0, // 使用准确的总数
      today: 0,
      yesterday: 0,
      thisWeek: 0,
      lastWeek: 0,
      highSeverity: 0,
      highSeverityLastWeek: 0
    }

    allKeys.forEach(key => {
      const keyDate = new Date(key.first_seen)
      
      // 今日统计
      if (keyDate >= today) {
        stats.today++
      }
      
      // 昨日统计
      if (keyDate >= yesterday && keyDate < today) {
        stats.yesterday++
      }
      
      // 本周统计
      if (keyDate >= weekAgo) {
        stats.thisWeek++
      }
      
      // 上周统计
      if (keyDate >= twoWeeksAgo && keyDate < weekAgo) {
        stats.lastWeek++
      }
      
      // 高危密钥统计
      if (key.severity === 'high') {
        stats.highSeverity++
        
        // 上周高危密钥
        if (keyDate >= twoWeeksAgo && keyDate < weekAgo) {
          stats.highSeverityLastWeek++
        }
      }
    })

    // 计算趋势百分比
    const calculateTrend = (current, previous) => {
      if (previous === 0) {
        if (current === 0) {
          return { change: '0%', type: 'neutral' }
        } else {
          return { change: '+100%', type: 'increase' }
        }
      }
      
      if (current === 0) {
        return { change: '-100%', type: 'decrease' }
      }
      
      const percentage = ((current - previous) / previous * 100)
      const roundedPercentage = Math.round(percentage * 10) / 10 // 保留1位小数，四舍五入
      
      if (roundedPercentage > 0) {
        return { change: `+${roundedPercentage}%`, type: 'increase' }
      } else if (roundedPercentage < 0) {
        return { change: `${roundedPercentage}%`, type: 'decrease' }
      } else {
        return { change: '0%', type: 'neutral' }
      }
    }

    // 使用已计算的数据，避免重复计算
    const totalTrend = calculateTrend(stats.thisWeek, stats.lastWeek)
    const todayTrend = calculateTrend(stats.today, stats.yesterday)
    const weekTrend = calculateTrend(stats.thisWeek, stats.lastWeek)
    const highSeverityTrend = calculateTrend(stats.highSeverity, stats.highSeverityLastWeek)

    const trends = {
      total_keys: {
        value: stats.total,
        trend: totalTrend
      },
      today_count: {
        value: stats.today,
        trend: todayTrend
      },
      week_count: {
        value: stats.thisWeek,
        trend: weekTrend
      },
      high_severity: {
        value: stats.highSeverity,
        trend: highSeverityTrend
      },
      // 额外的统计信息
      details: {
        yesterday: stats.yesterday,
        lastWeek: stats.lastWeek,
        highSeverityLastWeek: stats.highSeverityLastWeek,
        totalThisWeek: stats.thisWeek, // 使用已计算的thisWeek
        totalLastWeek: stats.lastWeek   // 使用已计算的lastWeek
      }
    }

    console.log('Trends calculated:', trends)

    return Response.json({
      success: true,
      trends,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Stats trends calculation error:', error)
    return Response.json({
      error: '趋势计算失败',
      details: error.message
    }, { status: 500 })
  }
}