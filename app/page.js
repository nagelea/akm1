'use client'

import { useState, useEffect } from 'react'
import supabase from '../lib/supabase'
import Dashboard from './components/Dashboard'

export default function Home() {
  const [stats, setStats] = useState(null)
  const [recentKeys, setRecentKeys] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    
    // 每30秒刷新数据
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      // 统一使用stats-trends API获取所有统计数据，确保一致性
      const trendsResponse = await fetch('/api/stats-trends')
      const trendsData = await trendsResponse.json()
      
      if (trendsData.success) {
        // 尝试获取额外的分布数据
        const { data: statsData, error: statsError } = await supabase
          .rpc('get_dashboard_stats')
        
        setStats({
          total_keys: trendsData.trends.total_keys.value,
          today_count: trendsData.trends.today_count.value,
          week_count: trendsData.trends.week_count.value,
          high_severity: trendsData.trends.high_severity.value,
          verified_keys: 0, // 需要单独查询
          key_type_distribution: statsData?.[0]?.key_type_distribution || {},
          severity_distribution: statsData?.[0]?.severity_distribution || {},
          status_distribution: statsData?.[0]?.status_distribution || {}
        })
        
        console.log('✅ 使用统一的stats-trends数据源:', {
          total: trendsData.trends.total_keys.value,
          today: trendsData.trends.today_count.value,
          week: trendsData.trends.week_count.value,
          high: trendsData.trends.high_severity.value
        })
      } else {
        console.error('Stats-trends API失败，使用备用方案')
        
        // 备用方案：直接查询数据库
        const { data: fallbackStats } = await supabase
          .from('stats_summary')
          .select('*')
          .single()
        
        setStats(fallbackStats)
      }

      // 尝试使用新的最新密钥函数
      const { data: keysData, error: keysError } = await supabase
        .rpc('get_recent_keys', { limit_count: 50 })

      if (keysError) {
        console.log('新密钥函数不可用，使用备用方法:', keysError)
        
        // 备用方案：直接查询表
        const { data: fallbackKeys } = await supabase
          .from('leaked_keys')
          .select('*')
          .order('first_seen', { ascending: false })
          .limit(50)
        
        setRecentKeys(fallbackKeys || [])
      } else {
        setRecentKeys(keysData || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和概述 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              API Key Leak Monitoring
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              实时监控GitHub上泄露的AI API密钥，包括OpenAI、Anthropic、Google等
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <button
              onClick={fetchData}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              刷新数据
            </button>
          </div>
        </div>
      </div>

      {/* 仪表板 */}
      <Dashboard stats={stats} recentKeys={recentKeys} />
    </div>
  )
}