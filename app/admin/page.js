'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import supabase from '../../lib/supabase'
import AdminLogin from './components/AdminLogin'
import AdminDashboard from './components/AdminDashboard'
import Link from 'next/link'

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const initializedRef = useRef(false)
  const authCheckingRef = useRef(false)

  // 重置错误状态的函数
  const resetError = useCallback(() => {
    setError(null)
    setLoading(true)
  }, [])

  // 检查管理员权限
  const checkAdminPermission = useCallback(async (sessionUser) => {
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', sessionUser.email)
      .single()
    
    if (adminError) {
      if (adminError.code === 'PGRST116') {
        throw new Error('该账户不是管理员账户')
      } else {
        throw new Error('管理员验证失败: ' + adminError.message)
      }
    }
    
    return adminUser
  }, [])

  // 检查认证状态的函数
  const checkAuth = useCallback(async (skipLoading = false) => {
    if (authCheckingRef.current) {
      console.log('Auth check already in progress, skipping...')
      return
    }

    try {
      authCheckingRef.current = true
      console.log('Checking auth...')
      
      if (!skipLoading) {
        setError(null)
        setLoading(true)
      }
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('Session error:', sessionError)
        throw new Error('认证服务连接失败: ' + sessionError.message)
      }
      
      if (session?.user) {
        console.log('User found:', session.user.email)
        
        // 验证是否为管理员
        const adminUser = await checkAdminPermission(session.user)
        
        if (adminUser) {
          console.log('Admin user found:', adminUser)
          setUser({ ...session.user, role: adminUser.role })
          setError(null)
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
      authCheckingRef.current = false
    }
  }, [checkAdminPermission])

  useEffect(() => {
    if (initializedRef.current) return

    let timeoutId = null
    let subscription = null

    const initializeAuth = async () => {
      // 设置超时处理
      timeoutId = setTimeout(() => {
        if (loading && !authCheckingRef.current) {
          setError('加载超时，请检查网络连接')
          setLoading(false)
        }
      }, 15000) // 增加到15秒超时

      await checkAuth()

      // 监听认证状态变化 - 简化逻辑
      const { data: authData } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('Auth state changed:', event)
          
          // 避免初始化时的重复调用
          if (!initializedRef.current) {
            return
          }
          
          if (event === 'SIGNED_OUT') {
            setUser(null)
            setError(null)
            setLoading(false)
          } else if (event === 'SIGNED_IN' && session?.user) {
            // 简化登录后的处理
            try {
              const adminUser = await checkAdminPermission(session.user)
              setUser({ ...session.user, role: adminUser.role })
              setError(null)
            } catch (error) {
              setError(error.message)
              setUser(null)
            }
            setLoading(false)
          }
        }
      )
      
      subscription = authData.subscription
      initializedRef.current = true
    }

    initializeAuth()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (subscription) subscription.unsubscribe()
    }
  }, [checkAuth, checkAdminPermission]) // 移除retryCount依赖

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
                  initializedRef.current = false
                  resetError()
                  checkAuth()
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