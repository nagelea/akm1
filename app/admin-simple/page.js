'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function SimpleAdminPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [keys, setKeys] = useState([])

  useEffect(() => {
    initAdmin()
  }, [])

  const initAdmin = async () => {
    try {
      console.log('Starting simple admin init...')
      
      // 简单检查session
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Session:', session?.user?.email || 'No session')
      
      if (session?.user) {
        setUser(session.user)
        await loadKeys()
      }
      
    } catch (error) {
      console.error('Admin init failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadKeys = async () => {
    try {
      const { data } = await supabase
        .from('leaked_keys')
        .select(`
          *,
          leaked_keys_sensitive (
            full_key,
            raw_context,
            github_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      setKeys(data || [])
      console.log('Loaded keys:', data?.length || 0)
    } catch (error) {
      console.error('Failed to load keys:', error)
    }
  }

  const handleLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'admin@test.com',
        password: 'temp123'
      })
      
      if (error) {
        alert('登录失败: ' + error.message)
      } else {
        setUser(data.user)
        await loadKeys()
      }
    } catch (error) {
      alert('登录错误: ' + error.message)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setKeys([])
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>加载简化管理后台...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-center mb-6">🔐 简化管理登录</h2>
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          >
            使用 admin@test.com 登录
          </button>
          <div className="mt-4 text-sm text-gray-500 text-center">
            <p>简化版管理后台，避免复杂的认证逻辑</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 简单的导航 */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">🛡️ 简化管理后台</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-900"
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto py-6 px-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium">
              发现的API密钥 ({keys.length} 条)
            </h2>
            <button
              onClick={loadKeys}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              刷新
            </button>
          </div>

          {keys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>暂无发现的API密钥</p>
              <p className="text-sm mt-2">运行扫描器后数据会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div key={key.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">
                        {key.key_type.toUpperCase()} - {key.key_preview}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {key.repo_name} • {key.file_path}
                      </p>
                      <p className="text-sm text-gray-500">
                        发现时间: {new Date(key.first_seen).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex flex-col space-y-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        key.severity === 'high' ? 'bg-red-100 text-red-800' :
                        key.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {key.severity}
                      </span>
                      
                      {key.leaked_keys_sensitive && (
                        <div className="space-y-1">
                          <button
                            onClick={() => {
                              const fullKey = key.leaked_keys_sensitive.full_key
                              navigator.clipboard.writeText(fullKey)
                              alert(`完整密钥已复制: ${fullKey}`)
                            }}
                            className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                          >
                            复制完整密钥
                          </button>
                          
                          {key.leaked_keys_sensitive.github_url && (
                            <a
                              href={key.leaked_keys_sensitive.github_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 text-center"
                            >
                              查看源码
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {key.context_preview && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                      <code>{key.context_preview}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}