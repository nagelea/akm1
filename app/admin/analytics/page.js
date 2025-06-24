'use client'

import { useState, useEffect } from 'react'
import AnalyticsDashboard from '../../components/AnalyticsDashboard'
import { useRouter } from 'next/navigation'

export default function AnalyticsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // 检查认证状态
    const checkAuth = async () => {
      try {
        // 这里应该检查用户是否已登录管理后台
        // 暂时简化处理，实际项目中需要完善认证逻辑
        const isLoggedIn = localStorage.getItem('admin_logged_in') === 'true'
        
        if (!isLoggedIn) {
          router.push('/admin')
          return
        }
        
        setIsAuthenticated(true)
      } catch (error) {
        console.error('Auth check failed:', error)
        router.push('/admin')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">访问统计</h1>
        <button
          onClick={() => router.push('/admin')}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          返回管理后台
        </button>
      </div>
      
      <AnalyticsDashboard />
    </div>
  )
}