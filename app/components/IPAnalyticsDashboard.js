'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']
const RISK_COLORS = {
  low: '#22C55E',
  medium: '#F59E0B', 
  high: '#EF4444'
}

export default function IPAnalyticsDashboard() {
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(7)
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState({
    summary: {},
    topIPs: [],
    geographic: {},
    riskAnalysis: [],
    hourlyDistribution: []
  })
  const [selectedIP, setSelectedIP] = useState(null)
  const [ipDetails, setIPDetails] = useState(null)

  useEffect(() => {
    fetchIPAnalytics()
  }, [timeRange])

  const fetchIPAnalytics = async () => {
    setLoading(true)
    try {
      const [summaryRes, topIPsRes, geoRes, riskRes, hourlyRes] = await Promise.all([
        fetch(`/api/ip-analytics?type=summary&days=${timeRange}`),
        fetch(`/api/ip-analytics?type=top-ips&days=${timeRange}&limit=20`),
        fetch(`/api/ip-analytics?type=geographic&days=${timeRange}`),
        fetch(`/api/ip-analytics?type=risk-analysis&days=${timeRange}&limit=30`),
        fetch(`/api/ip-analytics?type=hourly-distribution&days=${timeRange}`)
      ])

      const [summary, topIPs, geographic, riskAnalysis, hourlyDistribution] = await Promise.all([
        summaryRes.json(),
        topIPsRes.json(),
        geoRes.json(),
        riskRes.json(),
        hourlyRes.json()
      ])

      setData({
        summary,
        topIPs,
        geographic,
        riskAnalysis,
        hourlyDistribution
      })
    } catch (error) {
      console.error('Failed to fetch IP analytics:', error)
    }
    setLoading(false)
  }

  const fetchIPDetails = async (ip) => {
    try {
      const response = await fetch(`/api/ip-analytics?type=ip-details&ip=${ip}&days=${timeRange}`)
      const details = await response.json()
      setIPDetails(details)
      setSelectedIP(ip)
    } catch (error) {
      console.error('Failed to fetch IP details:', error)
    }
  }

  const StatCard = ({ title, value, trend, icon, color = 'blue' }) => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
          {trend && (
            <p className={`text-sm ${trend.type === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
              {trend.change} vs 前周期
            </p>
          )}
        </div>
        <div className={`text-3xl text-${color}-500`}>{icon}</div>
      </div>
    </div>
  )

  const RiskBadge = ({ level, score }) => {
    const colors = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800'
    }
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[level]}`}>
        {level.toUpperCase()} ({score})
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const countryData = Object.entries(data.geographic.countries || {}).map(([country, count]) => ({
    name: country,
    value: count
  }))

  const riskDistributionData = data.summary.risk_distribution ? [
    { name: '低风险', value: data.summary.risk_distribution.low, color: RISK_COLORS.low },
    { name: '中风险', value: data.summary.risk_distribution.medium, color: RISK_COLORS.medium },
    { name: '高风险', value: data.summary.risk_distribution.high, color: RISK_COLORS.high }
  ] : []

  return (
    <div className="space-y-6">
      {/* 标题和控制 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">IP 访问分析</h2>
        <div className="flex gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value={1}>最近 1 天</option>
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
          </select>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="总访问量"
          value={data.summary.total_visits?.toLocaleString() || '0'}
          icon="📊"
          color="blue"
        />
        <StatCard
          title="独立IP数量"
          value={data.summary.unique_ips?.toLocaleString() || '0'}
          icon="🌐"
          color="green"
        />
        <StatCard
          title="独立访客"
          value={data.summary.unique_visitors?.toLocaleString() || '0'}
          icon="👥"
          color="purple"
        />
        <StatCard
          title="平均访问次数/IP"
          value={data.summary.avg_visits_per_ip ? parseFloat(data.summary.avg_visits_per_ip).toFixed(1) : '0'}
          icon="📈"
          color="orange"
        />
      </div>

      {/* 选项卡 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: '概览', icon: '📊' },
            { id: 'geographic', label: '地理分布', icon: '🌍' },
            { id: 'risk', label: '风险分析', icon: '⚠️' },
            { id: 'activity', label: '活动模式', icon: '⏰' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 选项卡内容 */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 最活跃IP */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">最活跃 IP 地址</h3>
              <div className="space-y-3">
                {(data.topIPs || []).slice(0, 10).map((ip, index) => (
                  <div 
                    key={ip.ip} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                    onClick={() => fetchIPDetails(ip.ip)}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-mono text-blue-600">{ip.ip}</span>
                      <span className="text-xs text-gray-500">
                        {ip.country !== 'Unknown' && `${ip.city}, ${ip.country}`}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{ip.visit_count} 次访问</div>
                      <div className="text-xs text-gray-500">#{index + 1}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 风险分布 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">风险等级分布</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={riskDistributionData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {riskDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'geographic' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 国家分布 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">国家访问分布</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={countryData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 城市分布 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">主要城市访问量</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {Object.entries(data.geographic.cities || {}).slice(0, 20).map(([city, count]) => (
                  <div key={city} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-sm">{city}</span>
                    <span className="text-sm font-semibold text-blue-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">高风险 IP 分析</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP 地址</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">访问次数</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">页面数</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">风险等级</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最后访问</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(data.riskAnalysis || []).map((ip) => (
                      <tr key={ip.ip_address} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600">
                          {ip.ip_address}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ip.visit_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ip.unique_pages}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <RiskBadge level={ip.risk?.level || 'low'} score={ip.risk?.score || 0} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(ip.last_visit).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button 
                            onClick={() => fetchIPDetails(ip.ip_address)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            详情
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">24小时访问模式</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data.hourlyDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="visits" fill="#0088FE" name="总访问量" />
                <Line yAxisId="right" type="monotone" dataKey="unique_ips" stroke="#FF8042" name="独立IP数" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* IP详情模态框 */}
      {selectedIP && ipDetails && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">IP 详细分析: {selectedIP}</h3>
                <button 
                  onClick={() => setSelectedIP(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                {/* 地理位置信息 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">地理位置信息</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>国家: {ipDetails.location?.country || 'Unknown'}</div>
                    <div>城市: {ipDetails.location?.city || 'Unknown'}</div>
                    <div>时区: {ipDetails.location?.timezone || 'Unknown'}</div>
                    <div>ISP: {ipDetails.location?.isp || 'Unknown'}</div>
                  </div>
                </div>

                {/* 访问统计 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">访问统计</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>总访问: {ipDetails.stats?.total_visits}</div>
                    <div>访问页面: {ipDetails.stats?.unique_pages}</div>
                    <div>访问天数: {ipDetails.stats?.unique_days}</div>
                    <div>平均停留: {ipDetails.stats?.avg_session_duration}秒</div>
                  </div>
                </div>

                {/* 风险评估 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">风险评估</h4>
                  <div className="flex items-center space-x-4">
                    <RiskBadge level={ipDetails.risk?.level} score={ipDetails.risk?.score} />
                    <div className="text-sm text-gray-600">
                      风险因子: {ipDetails.risk?.factors?.join(', ') || '无'}
                    </div>
                  </div>
                </div>

                {/* 最近访问 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">最近访问记录</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {ipDetails.recent_visits?.slice(0, 10).map((visit, index) => (
                      <div key={index} className="text-xs bg-white p-2 rounded flex justify-between">
                        <span>{visit.page_path}</span>
                        <span className="text-gray-500">
                          {new Date(visit.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}