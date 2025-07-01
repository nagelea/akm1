'use client'

import { useState, useEffect } from 'react'

export default function StatsCards({ stats }) {
  const [trends, setTrends] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTrends()
  }, [])

  const fetchTrends = async () => {
    try {
      const response = await fetch('/api/stats-trends')
      const data = await response.json()
      
      if (data.success) {
        setTrends(data.trends)
      } else {
        console.error('Failed to fetch trends:', data.error)
      }
    } catch (error) {
      console.error('Error fetching trends:', error)
    } finally {
      setLoading(false)
    }
  }

  const cards = [
    {
      title: '总发现数量',
      value: stats?.total_keys || 0,
      change: trends?.total_keys?.trend?.change || '0%',
      changeType: trends?.total_keys?.trend?.type || 'neutral',
      icon: '🔢',
      description: '累计监测到的API密钥总数' + (trends?.details?.totalThisWeek !== undefined ? ` (本周新增: ${trends.details.totalThisWeek}, 上周新增: ${trends.details.totalLastWeek})` : '')
    },
    {
      title: '今日新增',
      value: stats?.today_count || 0,
      change: trends?.today_count?.trend?.change || '0%', 
      changeType: trends?.today_count?.trend?.type || 'neutral',
      icon: '📅',
      description: '今天新发现的密钥数量' + (trends?.details?.yesterday !== undefined ? ` (昨日: ${trends.details.yesterday})` : '')
    },
    {
      title: '本周统计',
      value: stats?.week_count || 0,
      change: trends?.week_count?.trend?.change || '0%',
      changeType: trends?.week_count?.trend?.type || 'neutral', 
      icon: '📊',
      description: '最近7天发现的密钥总数' + (trends?.details?.lastWeek !== undefined ? ` (前7天: ${trends.details.lastWeek})` : '')
    },
    {
      title: '高危警报',
      value: stats?.high_severity || 0,
      change: trends?.high_severity?.trend?.change || '0%',
      changeType: trends?.high_severity?.trend?.type || 'neutral',
      icon: '⚠️',
      description: '需要立即处理的高危密钥'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div key={index} className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <div className="ml-4 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  {card.title}
                </dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900">
                    {card.value.toLocaleString()}
                  </div>
                  <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                    card.changeType === 'increase' ? 'text-green-600' : 
                    card.changeType === 'decrease' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {card.changeType === 'increase' ? (
                      <ArrowUpIcon className="h-3 w-3 flex-shrink-0 self-center" />
                    ) : card.changeType === 'decrease' ? (
                      <ArrowDownIcon className="h-3 w-3 flex-shrink-0 self-center" />
                    ) : (
                      <MinusIcon className="h-3 w-3 flex-shrink-0 self-center" />
                    )}
                    <span className="sr-only">
                      {card.changeType === 'increase' ? 'Increased' : 
                       card.changeType === 'decrease' ? 'Decreased' : 'No change'} by
                    </span>
                    {loading ? '...' : card.change}
                  </div>
                </dd>
                <dd className="text-xs text-gray-500 mt-1">
                  {card.description}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ArrowUpIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function ArrowDownIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function MinusIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
    </svg>
  )
}