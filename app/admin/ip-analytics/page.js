'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import IPAnalyticsDashboard from '../../components/IPAnalyticsDashboard'

export default function IPAnalyticsPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        router.push('/admin')
        return
      }

      // 验证管理员权限
      const { data: adminUser, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', session.user.email)
        .single()

      if (error || !adminUser) {
        router.push('/admin')
        return
      }

      setUser(adminUser)
    } catch (error) {
      console.error('Auth check failed:', error)
      router.push('/admin')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏 */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                🔐 API Key Monitor - IP 分析
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {user.email} ({user.role})
              </span>
              <button
                onClick={() => router.push('/admin')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                返回管理后台
              </button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/admin')
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                登出
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <IPAnalyticsDashboard />
        </div>
      </main>
    </div>
  )
}