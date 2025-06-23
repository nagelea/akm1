import { createClient } from '@supabase/supabase-js'

// API routes need service key, not the shared client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function GET() {
  try {
    console.log('Calculating stats trends...')

    // 获取当前时间点
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)

    // 获取所有密钥数据 - 使用更高的限制避免默认1000行限制
    const { data: allKeys, error } = await supabase
      .from('leaked_keys')
      .select('created_at, severity')
      .limit(100000) // 设置足够高的限制

    if (error) {
      throw new Error('获取密钥数据失败: ' + error.message)
    }

    // 如果接近限制，发出警告
    if (allKeys && allKeys.length >= 100000) {
      console.warn('⚠️ Stats-trends query hit limit! May be incomplete data. Total retrieved:', allKeys.length)
    }

    // 按时间分组统计
    const stats = {
      total: allKeys.length,
      today: 0,
      yesterday: 0,
      thisWeek: 0,
      lastWeek: 0,
      highSeverity: 0,
      highSeverityLastWeek: 0
    }

    allKeys.forEach(key => {
      const keyDate = new Date(key.created_at)
      
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
        return current > 0 ? { change: '+100%', type: 'increase' } : { change: '0%', type: 'neutral' }
      }
      
      const percentage = ((current - previous) / previous * 100).toFixed(1)
      const absPercentage = Math.abs(percentage)
      
      if (percentage > 0) {
        return { change: `+${absPercentage}%`, type: 'increase' }
      } else if (percentage < 0) {
        return { change: `-${absPercentage}%`, type: 'decrease' }
      } else {
        return { change: '0%', type: 'neutral' }
      }
    }

    // 计算总数趋势（本周 vs 上周的密钥总增长）
    const totalThisWeek = allKeys.filter(key => new Date(key.created_at) >= weekAgo).length
    const totalLastWeek = allKeys.filter(key => new Date(key.created_at) >= twoWeeksAgo && new Date(key.created_at) < weekAgo).length
    const totalTrend = calculateTrend(totalThisWeek, totalLastWeek)
    
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
        highSeverityLastWeek: stats.highSeverityLastWeek
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