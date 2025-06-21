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
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* 基本信息 */}
                    <div className="lg:col-span-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-medium text-lg">
                          {key.key_type.toUpperCase()}
                        </h3>
                        <span className={`px-2 py-1 rounded text-xs ${
                          key.severity === 'high' ? 'bg-red-100 text-red-800' :
                          key.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {key.severity}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          key.confidence === 'high' ? 'bg-blue-100 text-blue-800' :
                          key.confidence === 'medium' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {key.confidence}
                        </span>
                      </div>
                      
                      <div className="space-y-1 text-sm text-gray-600">
                        <p><span className="font-medium">仓库:</span> 
                          <a 
                            href={`https://github.com/${key.repo_name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 ml-1"
                          >
                            {key.repo_name}
                          </a>
                        </p>
                        <p><span className="font-medium">文件:</span> 
                          {key.leaked_keys_sensitive?.github_url ? (
                            <a
                              href={key.leaked_keys_sensitive.github_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 ml-1"
                            >
                              {key.file_path}
                            </a>
                          ) : (
                            <span className="ml-1">{key.file_path}</span>
                          )}
                        </p>
                        <p><span className="font-medium">语言:</span> {key.repo_language}</p>
                        <p><span className="font-medium">发现:</span> {new Date(key.first_seen).toLocaleString('zh-CN')}</p>
                      </div>
                    </div>

                    {/* 完整密钥 */}
                    <div className="lg:col-span-1">
                      <h4 className="font-medium text-sm text-gray-700 mb-2">完整API密钥:</h4>
                      {key.leaked_keys_sensitive?.full_key ? (
                        <div className="bg-gray-100 p-3 rounded border">
                          <code className="text-sm font-mono break-all text-red-600">
                            {key.leaked_keys_sensitive.full_key}
                          </code>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-3 rounded border">
                          <code className="text-sm font-mono text-gray-500">
                            {key.key_preview}
                          </code>
                          <p className="text-xs text-gray-400 mt-1">敏感数据未找到</p>
                        </div>
                      )}
                    </div>

                    {/* 代码上下文 */}
                    <div className="lg:col-span-1">
                      <h4 className="font-medium text-sm text-gray-700 mb-2">代码上下文:</h4>
                      {key.leaked_keys_sensitive?.raw_context || key.context_preview ? (
                        <div className="bg-gray-50 p-3 rounded border max-h-32 overflow-y-auto">
                          <code className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                            {key.leaked_keys_sensitive?.raw_context || key.context_preview}
                          </code>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-3 rounded border">
                          <p className="text-xs text-gray-400">无上下文信息</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}