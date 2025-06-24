'use client'

import { useState, useEffect } from 'react'
import supabase from '../../../lib/supabase'
import SensitiveKeysList from './SensitiveKeysList'
import VerificationDebug from './VerificationDebug'
import AnalyticsDashboard from '../../components/AnalyticsDashboard'

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('keys')
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      console.log('Refreshing stats...')
      
      // 尝试使用新的统计函数
      const { data: dashboardStats, error: dashboardError } = await supabase
        .rpc('get_dashboard_stats')
      
      if (dashboardError) {
        console.log('新统计函数不可用，使用备用方法:', dashboardError)
        
        // 备用方案：使用原来的聚合查询
        const [totalCountResult, todayCountResult, severityResult, statusResult] = await Promise.all([
          supabase.from('leaked_keys').select('id', { count: 'exact', head: true }),
          supabase.from('leaked_keys')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', new Date().toISOString().split('T')[0]),
          supabase.from('leaked_keys')
            .select('id', { count: 'exact', head: true })
            .eq('severity', 'high'),
          supabase.from('leaked_keys')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'valid')
        ])

        const stats = {
          total: totalCountResult.count || 0,
          today: todayCountResult.count || 0,
          high_severity: severityResult.count || 0,
          verified: statusResult.count || 0
        }
        
        console.log('备用统计数据:', stats)
        setStats(stats)
      } else if (dashboardStats && dashboardStats.length > 0) {
        // 使用新的统计函数数据
        const stats = dashboardStats[0]
        const formattedStats = {
          total: stats.total_keys || 0,
          today: stats.today_keys || 0,
          high_severity: stats.high_severity_keys || 0,
          verified: stats.verified_keys || 0
        }
        
        console.log('✅ 使用新统计函数:', formattedStats)
        console.log('详细分布:', {
          key_types: stats.key_type_distribution,
          severities: stats.severity_distribution,
          statuses: stats.status_distribution
        })
        
        setStats(formattedStats)
      }
    } catch (error) {
      console.error('统计获取失败:', error)
      
      // 最终降级到原来的方法
      try {
        console.log('降级到基于行计数的方法...')
        const { data } = await supabase
          .from('leaked_keys')
          .select('id, severity, confidence, status, created_at')
          .limit(50000)
        
        if (data) {
          const today = new Date().toDateString()
          const stats = {
            total: data.length,
            today: data.filter(k => new Date(k.created_at).toDateString() === today).length,
            high_severity: data.filter(k => k.severity === 'high').length,
            verified: data.filter(k => k.status === 'valid').length
          }
          
          console.log('降级统计数据 (可能不完整):', stats)
          setStats(stats)
        }
      } catch (fallbackError) {
        console.error('所有统计方法都失败了:', fallbackError)
      }
    }
  }

  const handleLogout = async () => {
    try {
      // 记录登出日志
      await supabase.from('access_logs').insert({
        action: 'admin_logout',
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })
      
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const getClientIP = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json')
      const data = await response.json()
      return data.ip
    } catch {
      return null
    }
  }

  const tabs = [
    { id: 'keys', name: '敏感密钥', icon: '🔑' },
    { id: 'debug', name: '验证调试', icon: '🔧' },
    { id: 'logs', name: '访问日志', icon: '📋' },
    { id: 'analytics', name: '访问统计', icon: '📈' },
    { id: 'users', name: '用户管理', icon: '👥', adminOnly: true },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                🛡️ 管理员控制台
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {user.email} ({user.role})
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-900"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 统计卡片 */}
      {stats && (
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="text-2xl">📊</div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">总密钥数</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="text-2xl">📅</div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">今日新增</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.today}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="text-2xl">⚠️</div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">高危密钥</p>
                  <p className="text-2xl font-semibold text-red-600">{stats.high_severity}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="text-2xl">✅</div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">已验证</p>
                  <p className="text-2xl font-semibold text-green-600">{stats.verified}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 选项卡导航 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {tabs
                .filter(tab => !tab.adminOnly || user.role === 'admin')
                .map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* 选项卡内容 */}
          <div className="p-6">
            {activeTab === 'keys' && <SensitiveKeysList user={user} onStatsChange={fetchStats} />}
            {activeTab === 'debug' && <VerificationDebug onStatsChange={fetchStats} />}
            {activeTab === 'logs' && <AccessLogsList user={user} />}
            {activeTab === 'analytics' && <AnalyticsDashboard />}
            {activeTab === 'users' && user.role === 'admin' && <UserManagement />}
          </div>
        </div>
      </div>
    </div>
  )
}

// 占位组件
function AccessLogsList({ user }) {
  return (
    <div className="text-center py-8">
      <p className="text-gray-500">访问日志功能开发中...</p>
    </div>
  )
}

function UserManagement() {
  return (
    <div className="text-center py-8">
      <p className="text-gray-500">用户管理功能开发中...</p>
    </div>
  )
}