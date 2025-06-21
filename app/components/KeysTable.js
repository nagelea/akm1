'use client'

import { useState } from 'react'

export default function KeysTable({ keys }) {
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('first_seen')
  const [sortOrder, setSortOrder] = useState('desc')

  // 过滤和排序数据
  const filteredKeys = keys
    .filter(key => {
      if (filter === 'all') return true
      return key.severity === filter
    })
    .sort((a, b) => {
      let aValue = a[sortBy]
      let bValue = b[sortBy]
      
      if (sortBy === 'first_seen') {
        aValue = new Date(aValue)
        bValue = new Date(bValue)
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  return (
    <div className="space-y-4">
      {/* 过滤器 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <label htmlFor="filter" className="text-sm font-medium text-gray-700">
            筛选:
          </label>
          <select
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部</option>
            <option value="high">高危</option>
            <option value="medium">中危</option>
            <option value="low">低危</option>
          </select>
        </div>
        
        <div className="text-sm text-gray-500">
          显示 {filteredKeys.length} 条记录
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('severity')}
                >
                  危险等级
                  {sortBy === 'severity' && (
                    <span className="ml-1">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('key_type')}
                >
                  服务商
                  {sortBy === 'key_type' && (
                    <span className="ml-1">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  密钥预览
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  仓库信息
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('first_seen')}
                >
                  发现时间
                  {sortBy === 'first_seen' && (
                    <span className="ml-1">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredKeys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <SeverityBadge severity={key.severity} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <ServiceIcon type={key.key_type} />
                      <div className="ml-2">
                        <div className="text-sm font-medium text-gray-900">
                          {key.key_type.charAt(0).toUpperCase() + key.key_type.slice(1)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {key.file_extension}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                      {key.key_preview}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {key.repo_name}
                    </div>
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {key.file_path}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(key.first_seen).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      onClick={() => showDetails(key)}
                    >
                      详情
                    </button>
                    <button 
                      className="text-red-600 hover:text-red-900"
                      onClick={() => reportKey(key)}
                    >
                      举报
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredKeys.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">没有找到匹配的记录</p>
        </div>
      )}
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
    high: '🔴 高危',
    medium: '🟡 中危',
    low: '🟢 低危'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  )
}

function ServiceIcon({ type }) {
  const icons = {
    openai: '🤖',
    google: '🔍',
    anthropic: '🧠',
    huggingface: '🤗',
    cohere: '🔗',
    replicate: '🔄'
  }
  
  return (
    <span className="text-lg">
      {icons[type] || '🔑'}
    </span>
  )
}

function showDetails(key) {
  alert(`密钥详情:\n\n类型: ${key.key_type}\n仓库: ${key.repo_name}\n文件: ${key.file_path}\n上下文: ${key.context_preview}`)
}

function reportKey(key) {
  const confirmed = confirm('确定要举报这个密钥吗？我们会通知相关仓库的所有者。')
  if (confirmed) {
    alert('举报已提交，感谢您的反馈！')
  }
}