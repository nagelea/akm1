import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. 检查visitor_stats表中的基础数据
    const { data: basicStats, error: statsError } = await supabase
      .from('visitor_stats')
      .select('ip_address, created_at, page_path, country, browser')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .not('ip_address', 'is', null)
      .limit(10)

    if (statsError) {
      return NextResponse.json({ error: 'Basic stats failed', details: statsError })
    }

    // 2. 测试函数是否存在
    const { data: functionTest, error: functionError } = await supabase
      .rpc('get_ip_risk_analysis', { days_back: 7, ip_limit: 10 })

    if (functionError) {
      return NextResponse.json({ 
        error: 'Function call failed', 
        details: functionError,
        basicDataSample: basicStats.slice(0, 3)
      })
    }

    // 3. 手动计算一些统计来对比
    const ipGroups = {}
    basicStats.forEach(record => {
      const ip = record.ip_address
      if (!ipGroups[ip]) {
        ipGroups[ip] = { count: 0, pages: new Set(), countries: new Set() }
      }
      ipGroups[ip].count++
      ipGroups[ip].pages.add(record.page_path)
      if (record.country) ipGroups[ip].countries.add(record.country)
    })

    const manualStats = Object.entries(ipGroups).map(([ip, stats]) => ({
      ip,
      visit_count: stats.count,
      unique_pages: stats.pages.size,
      countries: Array.from(stats.countries)
    }))

    return NextResponse.json({
      basicDataCount: basicStats.length,
      functionResult: functionTest,
      functionResultCount: functionTest?.length || 0,
      manualStats: manualStats,
      sample: {
        basicData: basicStats.slice(0, 2),
        functionData: functionTest?.slice(0, 2) || []
      }
    })

  } catch (error) {
    console.error('Risk function test failed:', error)
    return NextResponse.json({ 
      error: 'Test exception', 
      message: error.message 
    })
  }
}