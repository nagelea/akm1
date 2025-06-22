'use client'

import { useState, useEffect } from 'react'
import supabase from '../../../lib/supabase'
import auth from '../../../lib/auth'

export default function AdminDebugPage() {
  const [debugInfo, setDebugInfo] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    runDiagnostics()
  }, [])

  const runDiagnostics = async () => {
    setLoading(true)
    const info = {}

    try {
      // 1. 检查环境变量
      info.environment = {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING'
      }

      // 2. 检查本地存储
      info.localStorage = {}
      if (typeof window !== 'undefined') {
        const keys = Object.keys(localStorage)
        info.localStorage.totalKeys = keys.length
        info.localStorage.supabaseKeys = keys.filter(k => k.includes('supabase') || k.startsWith('sb-'))
        info.localStorage.authToken = localStorage.getItem('sb-api-key-monitor-auth-token') ? 'EXISTS' : 'NOT_FOUND'
      }

      // 3. 检查当前session
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        info.session = {
          exists: !!session,
          error: error?.message || 'none',
          user: session?.user ? {
            id: session.user.id,
            email: session.user.email,
            confirmed: !!session.user.email_confirmed_at
          } : null
        }
      } catch (error) {
        info.session = {
          exists: false,
          error: error.message
        }
      }

      // 4. 检查admin用户
      if (info.session.exists && info.session.user) {
        try {
          const { data: adminUser, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('email', info.session.user.email)
            .single()

          info.adminUser = {
            exists: !!adminUser,
            error: error?.message || 'none',
            data: adminUser || null
          }
        } catch (error) {
          info.adminUser = {
            exists: false,
            error: error.message
          }
        }
      }

      // 5. 检查RLS策略
      try {
        const { data: testQuery, error } = await supabase
          .from('leaked_keys')
          .select('count', { count: 'exact', head: true })

        info.database = {
          accessible: !error,
          error: error?.message || 'none',
          recordCount: testQuery || 0
        }
      } catch (error) {
        info.database = {
          accessible: false,
          error: error.message
        }
      }

      setDebugInfo(info)
    } catch (error) {
      setDebugInfo({
        error: 'Diagnostics failed: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  const clearAllData = () => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
      sessionStorage.clear()
      alert('所有本地数据已清除，请刷新页面')
    }
  }

  const testLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'admin@test.com',
        password: 'temp123'
      })

      if (error) {
        alert('登录失败: ' + error.message)
      } else {
        alert('登录成功，正在重新运行诊断...')
        runDiagnostics()
      }
    } catch (error) {
      alert('登录错误: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>正在运行诊断...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">🔧 Admin认证诊断</h1>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={runDiagnostics}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                重新运行诊断
              </button>
              <button
                onClick={clearAllData}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                清除所有数据
              </button>
              <button
                onClick={testLogin}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                测试登录
              </button>
            </div>

            <div className="bg-gray-50 rounded p-4">
              <h2 className="text-lg font-semibold mb-4">诊断结果</h2>
              <pre className="text-sm overflow-auto">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>

            <div className="bg-blue-50 rounded p-4">
              <h3 className="font-semibold text-blue-900 mb-2">解决方案建议</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 如果session不存在，尝试"测试登录"</li>
                <li>• 如果localStorage有问题，点击"清除所有数据"</li>
                <li>• 如果admin用户不存在，检查admin_users表</li>
                <li>• 如果数据库访问失败，检查RLS策略</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}