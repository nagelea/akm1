'use client'

import { useState, useEffect } from 'react'

export default function KeyStatistics({ keys, onFilterChange }) {
  const [stats, setStats] = useState({})
  const [filteredStats, setFilteredStats] = useState({})
  const [activeFilters, setActiveFilters] = useState({
    keyType: 'all',
    severity: 'all',
    confidence: 'all',
    status: 'all'
  })

  useEffect(() => {
    calculateStats()
  }, [keys])

  useEffect(() => {
    calculateFilteredStats()
  }, [keys, activeFilters])

  const calculateStats = () => {
    if (!keys || keys.length === 0) {
      setStats({})
      return
    }

    const newStats = {
      total: keys.length,
      byType: {},
      bySeverity: {},
      byConfidence: {},
      byStatus: {},
      recentCount: 0
    }

    // 计算各种统计
    keys.forEach(key => {
      // 按类型统计
      newStats.byType[key.key_type] = (newStats.byType[key.key_type] || 0) + 1
      
      // 按严重程度统计
      newStats.bySeverity[key.severity] = (newStats.bySeverity[key.severity] || 0) + 1
      
      // 按置信度统计
      newStats.byConfidence[key.confidence] = (newStats.byConfidence[key.confidence] || 0) + 1
      
      // 按状态统计
      newStats.byStatus[key.status] = (newStats.byStatus[key.status] || 0) + 1
      
      // 最近24小时
      const keyDate = new Date(key.created_at)
      const now = new Date()
      const hoursDiff = (now - keyDate) / (1000 * 60 * 60)
      if (hoursDiff <= 24) {
        newStats.recentCount++
      }
    })

    setStats(newStats)
  }

  const calculateFilteredStats = () => {
    if (!keys || keys.length === 0) {
      setFilteredStats({})
      return
    }

    // 应用筛选条件
    let filtered = keys

    if (activeFilters.keyType !== 'all') {
      filtered = filtered.filter(key => key.key_type === activeFilters.keyType)
    }

    if (activeFilters.severity !== 'all') {
      filtered = filtered.filter(key => key.severity === activeFilters.severity)
    }

    if (activeFilters.confidence !== 'all') {
      filtered = filtered.filter(key => key.confidence === activeFilters.confidence)
    }

    if (activeFilters.status !== 'all') {
      filtered = filtered.filter(key => key.status === activeFilters.status)
    }

    // 计算筛选后的统计
    const newFilteredStats = {
      total: filtered.length,
      byType: {},
      bySeverity: {},
      byConfidence: {},
      byStatus: {},
      recentCount: 0
    }

    filtered.forEach(key => {
      // 按类型统计
      newFilteredStats.byType[key.key_type] = (newFilteredStats.byType[key.key_type] || 0) + 1
      
      // 按严重程度统计
      newFilteredStats.bySeverity[key.severity] = (newFilteredStats.bySeverity[key.severity] || 0) + 1
      
      // 按置信度统计
      newFilteredStats.byConfidence[key.confidence] = (newFilteredStats.byConfidence[key.confidence] || 0) + 1
      
      // 按状态统计
      newFilteredStats.byStatus[key.status] = (newFilteredStats.byStatus[key.status] || 0) + 1
      
      // 最近24小时
      const keyDate = new Date(key.created_at)
      const now = new Date()
      const hoursDiff = (now - keyDate) / (1000 * 60 * 60)
      if (hoursDiff <= 24) {
        newFilteredStats.recentCount++
      }
    })

    setFilteredStats(newFilteredStats)
  }

  const handleFilterChange = (filterType, value) => {
    const newFilters = { ...activeFilters, [filterType]: value }
    setActiveFilters(newFilters)
    onFilterChange(newFilters)
  }

  const clearAllFilters = () => {
    const resetFilters = {
      keyType: 'all',
      severity: 'all', 
      confidence: 'all',
      status: 'all'
    }
    setActiveFilters(resetFilters)
    onFilterChange(resetFilters)
  }

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'high': return 'text-red-600 bg-red-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'low': return 'text-green-600 bg-green-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getConfidenceColor = (confidence) => {
    switch(confidence) {
      case 'high': return 'text-blue-600 bg-blue-100'
      case 'medium': return 'text-purple-600 bg-purple-100'
      case 'low': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'valid': return 'text-green-600 bg-green-100'
      case 'invalid': return 'text-red-600 bg-red-100'
      case 'unknown': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  // 判断是否有筛选条件
  const hasActiveFilters = activeFilters.keyType !== 'all' || 
                          activeFilters.severity !== 'all' || 
                          activeFilters.confidence !== 'all' || 
                          activeFilters.status !== 'all'

  // 选择显示全部统计还是筛选后的统计
  const displayStats = hasActiveFilters ? filteredStats : stats

  if (!stats.total) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">📊 密钥统计</h3>
        <p className="text-gray-500">暂无数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 总体统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{displayStats.total || 0}</div>
          <div className="text-sm text-blue-600">{hasActiveFilters ? '筛选结果' : '总密钥数'}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{displayStats.recentCount || 0}</div>
          <div className="text-sm text-green-600">24小时内发现</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{Object.keys(displayStats.byType || {}).length}</div>
          <div className="text-sm text-purple-600">服务类型</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-orange-600">{displayStats.bySeverity?.high || 0}</div>
          <div className="text-sm text-orange-600">高风险密钥</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-600">{displayStats.byStatus?.unknown || 0}</div>
          <div className="text-sm text-gray-600">待验证密钥</div>
        </div>
      </div>

      {/* 筛选控件 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">🔍 筛选条件</h3>
          <button
            onClick={clearAllFilters}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >
            清除筛选
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 密钥类型筛选 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">密钥类型</label>
            <select
              value={activeFilters.keyType}
              onChange={(e) => handleFilterChange('keyType', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部类型</option>
              {Object.entries(stats.byType).map(([type, count]) => (
                <option key={type} value={type}>
                  {type} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* 严重程度筛选 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">严重程度</label>
            <select
              value={activeFilters.severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部级别</option>
              {Object.entries(stats.bySeverity).map(([severity, count]) => (
                <option key={severity} value={severity}>
                  {severity} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* 置信度筛选 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">置信度</label>
            <select
              value={activeFilters.confidence}
              onChange={(e) => handleFilterChange('confidence', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部置信度</option>
              {Object.entries(stats.byConfidence).map(([confidence, count]) => (
                <option key={confidence} value={confidence}>
                  {confidence} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* 验证状态筛选 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">验证状态</label>
            <select
              value={activeFilters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <option key={status} value={status}>
                  {status} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 详细统计图表 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 按类型统计 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            按服务类型 {hasActiveFilters && <span className="text-xs text-blue-600">(筛选结果)</span>}
          </h4>
          <div className="space-y-2">
            {Object.entries(displayStats.byType || {})
              .sort(([,a], [,b]) => b - a)
              .slice(0, 8)
              .map(([type, count]) => (
              <div key={type} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">{type}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${displayStats.total ? (count / displayStats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              </div>
            ))}
          </div>
          {Object.keys(displayStats.byType || {}).length === 0 && (
            <p className="text-sm text-gray-500">无匹配数据</p>
          )}
        </div>

        {/* 按严重程度统计 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            按严重程度 {hasActiveFilters && <span className="text-xs text-blue-600">(筛选结果)</span>}
          </h4>
          <div className="space-y-3">
            {Object.entries(displayStats.bySeverity || {}).map(([severity, count]) => (
              <div key={severity} className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(severity)}`}>
                  {severity}
                </span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
          {Object.keys(displayStats.bySeverity || {}).length === 0 && (
            <p className="text-sm text-gray-500">无匹配数据</p>
          )}
        </div>

        {/* 按验证状态统计 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            按验证状态 {hasActiveFilters && <span className="text-xs text-blue-600">(筛选结果)</span>}
          </h4>
          <div className="space-y-3">
            {Object.entries(displayStats.byStatus || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                  {status}
                </span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
          {Object.keys(displayStats.byStatus || {}).length === 0 && (
            <p className="text-sm text-gray-500">无匹配数据</p>
          )}
        </div>
      </div>
    </div>
  )
}