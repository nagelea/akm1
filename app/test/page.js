'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TestPage() {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    setLoading(true)
    setResult('Testing...')
    
    try {
      // 测试1: 基础连接
      console.log('Testing basic connection...')
      const { data: healthCheck, error: healthError } = await supabase
        .from('leaked_keys')
        .select('count', { count: 'exact', head: true })
      
      if (healthError) {
        setResult(`Health check failed: ${healthError.message}`)
        return
      }
      
      console.log('Health check passed')
      
      // 测试2: admin_users表查询
      console.log('Testing admin_users query...')
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', 'admin@test.com')
      
      if (adminError) {
        setResult(`Admin query failed: ${adminError.message}`)
        return
      }
      
      console.log('Admin query result:', adminData)
      
      // 测试3: Auth状态
      console.log('Testing auth status...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        setResult(`Session error: ${sessionError.message}`)
        return
      }
      
      console.log('Session:', session)
      
      setResult(`
✅ 连接测试成功!
- Health check: OK
- Admin users found: ${adminData?.length || 0}
- Current session: ${session ? 'Logged in as ' + session.user.email : 'Not logged in'}
- Environment: ${process.env.NODE_ENV}
- Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Configured' : 'Missing'}
- Anon Key: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Configured' : 'Missing'}
      `)
      
    } catch (error) {
      console.error('Test failed:', error)
      setResult(`❌ Test failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testLogin = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'admin@test.com',
        password: 'temp123'
      })
      
      if (error) {
        setResult(`❌ Login failed: ${error.message}`)
      } else {
        setResult(`✅ Login success: ${data.user.email}`)
      }
    } catch (error) {
      setResult(`❌ Login error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">🔧 Supabase Connection Test</h1>
      
      <div className="space-y-4 mb-6">
        <button
          onClick={testConnection}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'Test Connection'}
        </button>
        
        <button
          onClick={testLogin}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 ml-4"
        >
          {loading ? 'Testing...' : 'Test Login'}
        </button>
      </div>
      
      {result && (
        <div className="bg-gray-100 p-4 rounded">
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      )}
      
      <div className="mt-6 text-sm text-gray-600">
        <p>这个页面用于测试Supabase连接和配置。</p>
        <p>请先点击"Test Connection"，然后查看结果。</p>
      </div>
    </div>
  )
}