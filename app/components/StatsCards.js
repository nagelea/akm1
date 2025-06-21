'use client'

export default function StatsCards({ stats }) {
  const cards = [
    {
      title: '总发现数量',
      value: stats?.total_keys || 0,
      change: '+12%',
      changeType: 'increase',
      icon: '🔢',
      description: '累计监测到的API密钥总数'
    },
    {
      title: '今日新增',
      value: stats?.today_count || 0,
      change: '+8%', 
      changeType: 'increase',
      icon: '📅',
      description: '今天新发现的密钥数量'
    },
    {
      title: '本周统计',
      value: stats?.week_count || 0,
      change: '+15%',
      changeType: 'increase', 
      icon: '📊',
      description: '最近7天发现的密钥总数'
    },
    {
      title: '高危警报',
      value: stats?.high_severity || 0,
      change: '-5%',
      changeType: 'decrease',
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
                    card.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {card.changeType === 'increase' ? (
                      <ArrowUpIcon className="h-3 w-3 flex-shrink-0 self-center" />
                    ) : (
                      <ArrowDownIcon className="h-3 w-3 flex-shrink-0 self-center" />
                    )}
                    <span className="sr-only">
                      {card.changeType === 'increase' ? 'Increased' : 'Decreased'} by
                    </span>
                    {card.change}
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