'use client'

import { useState } from 'react'
import supabase from '../../../lib/supabase'
import auth from '../../../lib/auth'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // 首先验证是否为管理员用户
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .single()

      if (!adminUser) {
        throw new Error('无效的管理员账户')
      }

      // 使用Supabase Auth登录
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        throw authError
      }

      // 显示成功状态
      setSuccess(true)

      // 记录登录日志
      await supabase.from('access_logs').insert({
        user_id: adminUser.id,
        action: 'admin_login',
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })

      // 延迟一下让用户看到成功提示
      setTimeout(() => {
        console.log('Login successful, waiting for auth state change...')
      }, 1000)

    } catch (error) {
      setError(error.message)
      setSuccess(false)
    } finally {
      setTimeout(() => {
        setLoading(false)
      }, success ? 1200 : 0) // 成功时延迟更长时间
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

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            🔐 管理员登录
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            API密钥监控系统管理后台
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                邮箱地址
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="邮箱地址"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="密码"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">
                ✅ 登录成功！正在跳转到管理后台...
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || success}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                success 
                  ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
              }`}
            >
              {loading && !success && '登录中...'}
              {success && '登录成功 ✅'}
              {!loading && !success && '登录'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500 mb-2">
              仅限授权管理员访问敏感数据
            </p>
            <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">
              <p className="font-medium">测试账户:</p>
              <p>邮箱: admin@test.com</p>
              <p>密码: temp123</p>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}