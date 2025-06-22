import supabase from './supabase'

// 认证状态管理工具
export const auth = {
  // 获取当前session，带有重试机制
  async getSession(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        return data.session
      } catch (error) {
        console.error(`Session get attempt ${i + 1} failed:`, error)
        if (i === retries - 1) throw error
        // 等待一段时间再重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  },

  // 验证管理员权限
  async validateAdmin(user) {
    if (!user?.email) {
      throw new Error('用户信息无效')
    }

    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', user.email)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('该账户不是管理员账户')
      }
      throw new Error('管理员验证失败: ' + error.message)
    }

    if (!adminUser) {
      throw new Error('未找到管理员权限')
    }

    return adminUser
  },

  // 完整的认证检查流程
  async checkAuth() {
    try {
      const session = await this.getSession()
      
      if (!session?.user) {
        return { user: null, isAdmin: false }
      }

      const adminUser = await this.validateAdmin(session.user)
      
      return {
        user: { ...session.user, role: adminUser.role },
        isAdmin: true,
        adminUser
      }
    } catch (error) {
      throw error
    }
  },

  // 登出
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // 清除所有认证状态
  clearAuth() {
    // 清除localStorage中的Supabase session
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key)
      }
    })
    
    // 清除sessionStorage
    sessionStorage.clear()
  }
}

export default auth