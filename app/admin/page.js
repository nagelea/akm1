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

  useEffect(() => {
    // 检查登录状态
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // 验证是否为管理员
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('*')
          .eq('email', session.user.email)
          .single()
        
        if (adminUser) {
          setUser({ ...session.user, role: adminUser.role })
        }
      }
      setLoading(false)
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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