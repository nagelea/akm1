// 前端访问统计收集工具

class Analytics {
  constructor() {
    this.sessionStart = Date.now()
    this.currentPage = null
    this.sessionDuration = 0
    this.isTracking = true
    
    // 初始化
    this.init()
  }
  
  init() {
    if (typeof window === 'undefined') return
    
    // 记录当前页面访问
    this.trackPageView()
    
    // 监听页面卸载事件，记录会话时长
    window.addEventListener('beforeunload', () => {
      this.updateSessionDuration()
      this.sendAnalytics()
    })
    
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateOnlineStatus()
      } else {
        this.updateSessionDuration()
        this.sendAnalytics()
      }
    })
    
    // 定期更新在线状态
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.updateOnlineStatus()
      }
    }, 30000) // 每30秒更新一次
  }
  
  // 记录页面访问
  trackPageView(pagePath = null) {
    if (!this.isTracking) return
    
    this.currentPage = pagePath || window.location.pathname
    this.sessionStart = Date.now()
    this.sessionDuration = 0
    
    // 发送页面访问数据
    this.sendPageView()
  }
  
  // 更新会话时长
  updateSessionDuration() {
    this.sessionDuration = Math.floor((Date.now() - this.sessionStart) / 1000)
  }
  
  // 发送页面访问数据
  async sendPageView() {
    try {
      const data = {
        pagePath: this.currentPage,
        referrer: document.referrer || '',
        screenResolution: `${screen.width}x${screen.height}`,
        sessionDuration: 0
      }
      
      await this.sendToAPI(data)
    } catch (error) {
      console.error('Failed to send page view:', error)
    }
  }
  
  // 发送分析数据到API
  async sendAnalytics() {
    if (!this.isTracking || this.sessionDuration === 0) return
    
    try {
      const data = {
        pagePath: this.currentPage,
        referrer: document.referrer || '',
        screenResolution: `${screen.width}x${screen.height}`,
        sessionDuration: this.sessionDuration
      }
      
      await this.sendToAPI(data)
    } catch (error) {
      console.error('Failed to send analytics:', error)
    }
  }
  
  // 更新在线状态
  async updateOnlineStatus() {
    if (!this.isTracking) return
    
    try {
      await this.sendToAPI({
        pagePath: this.currentPage,
        referrer: document.referrer || '',
        screenResolution: `${screen.width}x${screen.height}`,
        sessionDuration: Math.floor((Date.now() - this.sessionStart) / 1000)
      })
    } catch (error) {
      console.error('Failed to update online status:', error)
    }
  }
  
  // 发送数据到API
  async sendToAPI(data) {
    try {
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      // 使用navigator.sendBeacon作为后备方案
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics', JSON.stringify(data))
      }
      throw error
    }
  }
  
  // 自定义事件跟踪
  trackEvent(eventName, properties = {}) {
    if (!this.isTracking) return
    
    console.log('Custom event:', eventName, properties)
    // 可以扩展为发送自定义事件到API
  }
  
  // 设置用户属性
  setUserProperty(key, value) {
    if (!this.isTracking) return
    
    console.log('User property:', key, value)
    // 可以扩展为发送用户属性到API
  }
  
  // 启用/禁用跟踪
  setTracking(enabled) {
    this.isTracking = enabled
    console.log('Analytics tracking:', enabled ? 'enabled' : 'disabled')
  }
}

// 创建全局实例
let analytics = null

// 初始化分析工具
export function initAnalytics() {
  if (typeof window !== 'undefined' && !analytics) {
    analytics = new Analytics()
  }
  return analytics
}

// 获取分析实例
export function getAnalytics() {
  return analytics || initAnalytics()
}

// 便捷函数
export function trackPageView(pagePath) {
  const analyticsInstance = getAnalytics()
  if (analyticsInstance) {
    analyticsInstance.trackPageView(pagePath)
  }
}

export function trackEvent(eventName, properties) {
  const analyticsInstance = getAnalytics()
  if (analyticsInstance) {
    analyticsInstance.trackEvent(eventName, properties)
  }
}

export function setUserProperty(key, value) {
  const analyticsInstance = getAnalytics()
  if (analyticsInstance) {
    analyticsInstance.setUserProperty(key, value)
  }
}

export function setAnalyticsTracking(enabled) {
  const analyticsInstance = getAnalytics()
  if (analyticsInstance) {
    analyticsInstance.setTracking(enabled)
  }
}

// 获取统计数据的API调用函数
export async function getAnalyticsData(type = 'summary', days = 7) {
  try {
    const response = await fetch(`/api/analytics?type=${type}&days=${days}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Failed to fetch analytics data:', error)
    return null
  }
}

export default {
  initAnalytics,
  getAnalytics,
  trackPageView,
  trackEvent,
  setUserProperty,
  setAnalyticsTracking,
  getAnalyticsData
}