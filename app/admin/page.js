'use client'

import { useState, useEffect } from 'react'
import supabase from '../../lib/supabase'
import AdminLogin from './components/AdminLogin'
import AdminDashboard from './components/AdminDashboard'
import Link from 'next/link'

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [initialCheckComplete, setInitialCheckComplete] = useState(false)

  // 重置错误状态的函数
  const resetError = () => {
    setError(null)
    setLoading(true)
  }

  // 检查认证状态的函数
  const checkAuth = async () => {
    try {
      console.log('Checking auth... (attempt:', retryCount + 1, ')')
      
      // 重置状态
      setError(null)
      setLoading(true)
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('Session error:', sessionError)
        throw new Error('认证服务连接失败: ' + sessionError.message)
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
          // 如果是数据未找到错误，提供更友好的提示
          if (adminError.code === 'PGRST116') {
            throw new Error('该账户不是管理员账户')
          } else {
            throw new Error('管理员验证失败: ' + adminError.message)
          }
        }
        
        if (adminUser) {
          console.log('Admin user found:', adminUser)
          setUser({ ...session.user, role: adminUser.role })
          setError(null) // 确保清除错误状态
        }
      } else {
        console.log('No session found - showing login form')
        setUser(null)
        setError(null)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setError(error.message)
      setUser(null)
    } finally {
      setLoading(false)
      setInitialCheckComplete(true)
    }
  }

  useEffect(() => {
    // 设置超时处理
    const timeout = setTimeout(() => {
      if (loading) {
        setError('加载超时，请检查网络连接')
        setLoading(false)
      }
    }, 8000) // 减少到8秒超时

    checkAuth()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event)
        
        // 只有在初始检查完成后才处理状态变化
        if (!initialCheckComplete) {
          console.log('Ignoring auth state change - initial check not complete')
          return
        }
        
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setError(null)
        } else if (event === 'SIGNED_IN' && session?.user) {
          // 添加延迟以改善用户体验
          setTimeout(async () => {
            setLoading(true)
            setError(null)
            
            try {
              const { data: adminUser, error: adminError } = await supabase
                .from('admin_users')
                .select('*')
                .eq('email', session.user.email)
                .single()
              
              if (adminError) {
                if (adminError.code === 'PGRST116') {
                  setError('该账户不是管理员账户')
                } else {
                  setError('管理员验证失败: ' + adminError.message)
                }
              } else if (adminUser) {
                setUser({ ...session.user, role: adminUser.role })
              }
            } catch (error) {
              setError('验证过程发生错误: ' + error.message)
            } finally {
              setLoading(false)
            }
          }, 800) // 延迟800ms
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [retryCount, initialCheckComplete]) // 依赖retryCount和initialCheckComplete

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
            
            <div className="space-y-2">
              <button 
                onClick={() => {
                  setRetryCount(prev => prev + 1)
                  resetError()
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                重试
              </button>
              
              <button 
                onClick={() => {
                  // 清除所有本地存储的认证信息
                  localStorage.clear()
                  sessionStorage.clear()
                  window.location.reload()
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                清除缓存并重新加载
              </button>
              
              <button 
                onClick={() => {
                  setUser(null)
                  setError(null)
                  setLoading(false)
                }}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                返回登录页面
              </button>
            </div>
            
            <div className="mt-4 text-sm text-gray-500">
              <p>常见解决方案：</p>
              <ul className="text-left mt-2 space-y-1">
                <li>• 使用 admin@test.com / temp123 登录</li>
                <li>• 清除浏览器缓存</li>
                <li>• 检查网络连接</li>
                <li>• 确认Supabase配置正确</li>
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