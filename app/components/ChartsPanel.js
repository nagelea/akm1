'use client'

import { useState, useEffect } from 'react'
import supabase from '../../lib/supabase'

export default function ChartsPanel() {
  const [dailyStats, setDailyStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChartData()
  }, [])

  async function fetchChartData() {
    try {
      const { data } = await supabase
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: true })
        .limit(30)

      setDailyStats(data || [])
    } catch (error) {
      console.error('Error fetching chart data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // 处理数据，计算趋势
  const processedData = dailyStats.map(stat => ({
    date: new Date(stat.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    total: stat.total_found,
    high: stat.by_severity?.high || 0,
    medium: stat.by_severity?.medium || 0,
    low: stat.by_severity?.low || 0,
    openai: stat.by_type?.openai || 0,
    google: stat.by_type?.google || 0,
    anthropic: stat.by_type?.anthropic || 0,
    others: (stat.by_type?.huggingface || 0) + (stat.by_type?.cohere || 0) + (stat.by_type?.replicate || 0)
  }))

  // 计算总体统计
  const totalStats = processedData.reduce((acc, day) => ({
    total: acc.total + day.total,
    high: acc.high + day.high,
    medium: acc.medium + day.medium,
    low: acc.low + day.low,
    openai: acc.openai + day.openai,
    google: acc.google + day.google,
    anthropic: acc.anthropic + day.anthropic,
    others: acc.others + day.others
  }), { total: 0, high: 0, medium: 0, low: 0, openai: 0, google: 0, anthropic: 0, others: 0 })

  return (
    <div className="space-y-8">
      {/* 趋势图表 */}
      <div className="bg-white rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          📈 每日发现趋势（最近30天）
        </h3>
        <SimpleLineChart data={processedData} />
      </div>

      {/* 分类统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 严重程度分布 */}
        <div className="bg-white rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            ⚠️ 严重程度分布
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                <span className="text-sm text-gray-700">高危</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.high}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-red-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.high / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                <span className="text-sm text-gray-700">中危</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.medium}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.medium / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span className="text-sm text-gray-700">低危</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.low}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.low / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 服务商分布 */}
        <div className="bg-white rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            🏢 API服务商分布
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-lg mr-2">🤖</span>
                <span className="text-sm text-gray-700">OpenAI</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.openai}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.openai / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-lg mr-2">🔍</span>
                <span className="text-sm text-gray-700">Google</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.google}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-red-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.google / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-lg mr-2">🧠</span>
                <span className="text-sm text-gray-700">Anthropic</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.anthropic}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.anthropic / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-lg mr-2">🔗</span>
                <span className="text-sm text-gray-700">其他</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">{totalStats.others}</span>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gray-500 h-2 rounded-full" 
                    style={{ width: `${(totalStats.others / totalStats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          📊 详细数据
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  日期
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  总数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  高危
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  中危
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  低危
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {processedData.slice(-10).reverse().map((day, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {day.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {day.total}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {day.high}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                    {day.medium}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {day.low}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// 简单的线性图表组件
function SimpleLineChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-8 text-gray-500">暂无数据</div>
  }

  const maxValue = Math.max(...data.map(d => d.total))
  const chartHeight = 200

  return (
    <div className="relative">
      <svg width="100%" height={chartHeight} className="overflow-visible">
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            y1={chartHeight * ratio}
            x2="100%"
            y2={chartHeight * ratio}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}
        
        {/* 数据线 */}
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          points={data.map((d, i) => 
            `${(i / (data.length - 1)) * 100}%,${chartHeight - (d.total / maxValue) * chartHeight}`
          ).join(' ')}
        />
        
        {/* 数据点 */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={`${(i / (data.length - 1)) * 100}%`}
            cy={chartHeight - (d.total / maxValue) * chartHeight}
            r="3"
            fill="#3b82f6"
          />
        ))}
      </svg>
      
      {/* X轴标签 */}
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        {data.map((d, i) => (
          <span key={i}>{d.date}</span>
        ))}
      </div>
    </div>
  )
}