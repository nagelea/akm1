'use client'

import { useState, useEffect } from 'react'
import { getAnalyticsData } from '../../lib/analytics'

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(7)
  const [onlineUsers, setOnlineUsers] = useState(0)

  // 加载统计数据
  const loadStats = async () => {
    setLoading(true)
    try {
      const [summaryData, onlineData] = await Promise.all([
        getAnalyticsData('summary', timeRange),
        getAnalyticsData('online')
      ])
      
      setStats(summaryData)
      setOnlineUsers(onlineData?.online || 0)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
    
    // 每分钟更新在线用户数
    const interval = setInterval(async () => {
      try {
        const onlineData = await getAnalyticsData('online')
        setOnlineUsers(onlineData?.online || 0)
      } catch (error) {
        console.error('Failed to update online users:', error)
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [timeRange])

  const formatNumber = (num) => {
    if (!num) return '0'
    return new Intl.NumberFormat().format(num)
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '0s'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 时间范围选择器 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">访问统计</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">时间范围：</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value={1}>今天</option>
              <option value={7}>近7天</option>
              <option value={30}>近30天</option>
              <option value={90}>近90天</option>
            </select>
          </div>
        </div>
      </div>

      {/* 概览统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总访问量"
          value={formatNumber(stats?.total_visits)}
          icon="👥"
          color="blue"
        />
        <StatCard
          title="独立访客"
          value={formatNumber(stats?.unique_visitors)}
          icon="👤"
          color="green"
        />
        <StatCard
          title="页面浏览量"
          value={formatNumber(stats?.page_views)}
          icon="📄"
          color="purple"
        />
        <StatCard
          title="当前在线"
          value={formatNumber(onlineUsers)}
          icon="🟢"
          color="red"
        />
      </div>

      {/* 详细统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 访问质量指标 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">访问质量</h4>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">平均会话时长</span>
              <span className="font-semibold">
                {formatDuration(Math.round(stats?.avg_session_duration || 0))}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">跳出率</span>
              <span className="font-semibold">
                {stats?.bounce_rate ? `${stats.bounce_rate.toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* 热门页面 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">热门页面</h4>
          <div className="space-y-2">
            {stats?.top_pages && Object.entries(stats.top_pages)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([page, count]) => (
                <div key={page} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 truncate flex-1 mr-2">{page}</span>
                  <span className="font-semibold">{formatNumber(count)}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* 设备统计 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">设备类型</h4>
          <div className="space-y-2">
            {stats?.device_stats && Object.entries(stats.device_stats)
              .sort(([,a], [,b]) => b - a)
              .map(([device, count]) => (
                <div key={device} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 capitalize">{device}</span>
                  <span className="font-semibold">{formatNumber(count)}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* 浏览器统计 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">浏览器分布</h4>
          <div className="space-y-2">
            {stats?.browser_stats && Object.entries(stats.browser_stats)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([browser, count]) => (
                <div key={browser} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{browser}</span>
                  <span className="font-semibold">{formatNumber(count)}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// 统计卡片组件
function StatCard({ title, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600'
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${colorClasses[color] || colorClasses.blue}`}>
          <span className="text-xl">{icon}</span>
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}