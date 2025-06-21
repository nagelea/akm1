'use client'

import { useState } from 'react'
import StatsCards from './StatsCards'
import KeysTable from './KeysTable'
import ChartsPanel from './ChartsPanel'

export default function Dashboard({ stats, recentKeys }) {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', name: '概览', icon: '📊' },
    { id: 'recent', name: '最新发现', icon: '🔍' },
    { id: 'charts', name: '趋势图表', icon: '📈' },
  ]

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <StatsCards stats={stats} />

      {/* 选项卡导航 */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <span>{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* 选项卡内容 */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <OverviewPanel stats={stats} recentKeys={recentKeys} />
          )}
          {activeTab === 'recent' && (
            <KeysTable keys={recentKeys} />
          )}
          {activeTab === 'charts' && (
            <ChartsPanel />
          )}
        </div>
      </div>
    </div>
  )
}

function OverviewPanel({ stats, recentKeys }) {
  return (
    <div className="space-y-6">
      {/* 快速统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-blue-900 mb-2">今日发现</h3>
          <p className="text-3xl font-bold text-blue-600">
            {stats?.today_count || 0}
          </p>
          <p className="text-sm text-blue-700 mt-1">
            个新泄露的API密钥
          </p>
        </div>
        
        <div className="bg-red-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-red-900 mb-2">高危密钥</h3>
          <p className="text-3xl font-bold text-red-600">
            {stats?.high_severity || 0}
          </p>
          <p className="text-sm text-red-700 mt-1">
            需要立即处理
          </p>
        </div>
        
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-green-900 mb-2">监控覆盖</h3>
          <p className="text-3xl font-bold text-green-600">
            {stats?.unique_types || 0}
          </p>
          <p className="text-sm text-green-700 mt-1">
            种API服务商
          </p>
        </div>
      </div>

      {/* 最新发现预览 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">最新发现的密钥</h3>
          <span className="text-sm text-gray-500">
            显示最近5条记录
          </span>
        </div>
        <div className="space-y-3">
          {recentKeys.slice(0, 5).map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <SeverityBadge severity={key.severity} />
                <div>
                  <p className="font-medium text-gray-900">
                    {key.key_type.charAt(0).toUpperCase() + key.key_type.slice(1)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {key.repo_name} • {key.file_extension}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900 font-mono">
                  {key.key_preview}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(key.first_seen).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SeverityBadge({ severity }) {
  const styles = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800'
  }
  
  const labels = {
    high: '高危',
    medium: '中危', 
    low: '低危'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  )
}