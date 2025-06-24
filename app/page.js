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
      // 尝试使用新的统计函数
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_dashboard_stats')

      if (statsError) {
        console.log('新统计函数不可用，使用备用方法:', statsError)
        
        // 备用方案：使用原来的方法
        const { data: fallbackStats } = await supabase
          .from('stats_summary')
          .select('*')
          .single()
        
        setStats(fallbackStats)
      } else if (statsData && statsData.length > 0) {
        // 转换新统计数据格式
        const stats = statsData[0]
        setStats({
          total_keys: stats.total_keys,
          today_keys: stats.today_keys,
          high_severity: stats.high_severity_keys,
          verified_keys: stats.verified_keys,
          key_type_distribution: stats.key_type_distribution,
          severity_distribution: stats.severity_distribution,
          status_distribution: stats.status_distribution
        })
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