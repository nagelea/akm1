'use client'

import { useEffect } from 'react'
import { initAnalytics, trackPageView } from '@/lib/analytics'
import { usePathname } from 'next/navigation'

export default function AnalyticsProvider({ children }) {
  const pathname = usePathname()

  useEffect(() => {
    // 初始化分析工具
    initAnalytics()
    
    // 跟踪当前页面访问
    trackPageView(pathname)
  }, [pathname])

  return <>{children}</>
}