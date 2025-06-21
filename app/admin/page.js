'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import AdminLogin from './components/AdminLogin'
import AdminDashboard from './components/AdminDashboard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // 设置超时处理
    const timeout = setTimeout(() => {
      if (loading) {
        setError('加载超时，请检查网络连接和数据库配置')
        setLoading(false)
      }
    }, 10000) // 10秒超时

    // 检查登录状态
    const checkAuth = async () => {
      try {
        console.log('Checking auth...')
        console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
        console.log('Anon Key configured:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          setError('认证服务连接失败: ' + sessionError.message)
          setLoading(false)
          clearTimeout(timeout)
          return
        }
        
        if (session?.user) {
          console.log('User found:', session.user.email)
          // 验证是否为管理员
          const { data: adminUser, error: adminError } = await supabase
            .from('admin_users')
            .select('*')
            .eq('email', session.user.email)
            .single()
          
          if (adminError) {
            console.error('Admin check error:', adminError)
            setError('管理员验证失败: ' + adminError.message)
          }
          
          if (adminUser) {
            console.log('Admin user found:', adminUser)
            setUser({ ...session.user, role: adminUser.role })
          } else {
            console.log('No admin user found for:', session.user.email)
            setError('未找到管理员账户，请检查admin_users表')
          }
        } else {
          console.log('No session found')
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        setError('认证检查失败: ' + error.message)
      } finally {
        setLoading(false)
        clearTimeout(timeout)
      }
    }

    checkAuth()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
        } else if (event === 'SIGNED_IN' && session?.user) {
          const { data: adminUser } = await supabase
            .from('admin_users')
            .select('*')
            .eq('email', session.user.email)
            .single()
          
          if (adminUser) {
            setUser({ ...session.user, role: adminUser.role })
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载管理后台...</p>
          <p className="text-sm text-gray-400 mt-2">如果长时间无响应，请检查网络连接</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">加载失败</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              重新加载
            </button>
            <div className="mt-4 text-sm text-gray-500">
              <p>请检查：</p>
              <ul className="text-left mt-2 space-y-1">
                <li>• Supabase配置是否正确</li>
                <li>• 网络连接是否正常</li>
                <li>• admin_users表是否存在</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {user ? (
        <AdminDashboard user={user} />
      ) : (
        <AdminLogin />
      )}
    </div>
  )
}