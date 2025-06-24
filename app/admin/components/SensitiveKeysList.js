'use client'

import { useState, useEffect } from 'react'
import supabase from '../../../lib/supabase'
import KeyStatistics from './KeyStatistics'

export default function SensitiveKeysList({ user, onStatsChange }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [showFullKey, setShowFullKey] = useState(false)
  const [decryptedKey, setDecryptedKey] = useState('')
  const [showManualExtractModal, setShowManualExtractModal] = useState(false)
  const [manualExtractKey, setManualExtractKey] = useState(null)
  const [extractedKeys, setExtractedKeys] = useState('')
  const [extractLoading, setExtractLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    keyType: 'all',
    severity: 'all',
    confidence: 'all',
    status: 'all'
  })
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [paginatedKeys, setPaginatedKeys] = useState([])
  const [totalRecords, setTotalRecords] = useState(0)

  useEffect(() => {
    fetchKeys()
  }, [currentPage, pageSize, searchQuery, filters])

  useEffect(() => {
    // 使用数据库分页时，不需要前端筛选
    if (keys.length > 0) {
      setPaginatedKeys(keys)
      // 从第一条记录获取总数
      if (keys[0] && keys[0].total_count !== undefined) {
        setTotalRecords(keys[0].total_count)
      }
    } else {
      setPaginatedKeys([])
      setTotalRecords(0)
    }
  }, [keys])

  // 计算分页信息
  const totalPages = Math.ceil(totalRecords / pageSize)
  const startRecord = totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0
  const endRecord = Math.min(currentPage * pageSize, totalRecords)

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters)
    setCurrentPage(1) // 重置到第一页
  }

  // 分页控制函数
  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1) // 重置到第一页
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const fetchKeys = async () => {
    try {
      setLoading(true)
      
      // 使用新的分页函数获取当前页数据
      const offset = (currentPage - 1) * pageSize
      
      const { data, error } = await supabase.rpc('get_keys_paginated', {
        page_offset: offset,
        page_size: pageSize,
        search_query: searchQuery || '',
        filter_key_type: filters.keyType || 'all',
        filter_severity: filters.severity || 'all', 
        filter_confidence: filters.confidence || 'all',
        filter_status: filters.status || 'all'
      })
      
      if (error) {
        console.error('分页查询失败，回退到原方法:', error)
        
        // 备用方案：使用原来的方法
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_keys_with_sensitive_data', { 
          limit_count: 5000 
        })
        
        if (fallbackError) {
          // 最终备用方案：分别查询
          const [keysResult, sensitiveResult] = await Promise.all([
            supabase.from('leaked_keys').select('*').order('created_at', { ascending: false }).limit(5000),
            supabase.from('leaked_keys_sensitive').select('*')
          ])
          
          if (keysResult.error || sensitiveResult.error) {
            throw new Error('所有查询方法都失败了')
          }
          
          // 手动合并数据
          const keysWithSensitive = keysResult.data.map(key => {
            const sensitive = sensitiveResult.data.find(s => s.key_id === key.id)
            return {
              ...key,
              leaked_keys_sensitive: sensitive || null
            }
          })
          
          setKeys(keysWithSensitive)
          setTotalRecords(keysWithSensitive.length)
          console.log('使用手动合并方法加载:', keysWithSensitive.length, '条记录')
        } else {
          const fallbackKeys = fallbackData || []
          setKeys(fallbackKeys)
          // 备用方案没有分页，所以总数就是当前数据长度
          setTotalRecords(fallbackKeys.length)
          console.log('使用备用RPC方法加载:', fallbackKeys.length, '条记录')
        }
      } else {
        // 成功使用新的分页函数
        if (data && data.length > 0) {
          // 数据格式转换：新的分页函数返回扁平结构
          const transformedData = data.map(row => ({
            id: row.id,
            key_type: row.key_type,
            key_preview: row.key_preview,
            severity: row.severity,
            confidence: row.confidence,
            status: row.status,
            repo_name: row.repo_name,
            file_path: row.file_path,
            repo_language: row.repo_language,
            first_seen: row.first_seen,
            last_verified: row.last_verified,
            context_preview: row.context_preview,
            total_count: row.total_count, // ✅ 保留总记录数
            leaked_keys_sensitive: row.full_key ? {
              full_key: row.full_key,
              raw_context: row.raw_context,
              github_url: row.github_url
            } : null
          }))
          
          setKeys(transformedData)
          
          // 总记录数会在useEffect中从数据中提取
          const totalCount = data[0]?.total_count || 0
          console.log(`✅ 使用分页查询加载: ${data.length} 条记录，总共 ${totalCount} 条`)
        } else {
          // 没有数据时，设置空数组但保持总数为0
          setKeys([])
          setTotalRecords(0)
          console.log('✅ 分页查询无结果')
        }
      }
    } catch (error) {
      console.error('获取密钥失败:', error)
      // 错误时也要重置状态
      setKeys([])
      setTotalRecords(0)
    } finally {
      setLoading(false)
    }
  }

  const viewFullKey = async (keyId, fullKey) => {
    try {
      // 记录访问日志
      await supabase.from('access_logs').insert({
        action: 'view_sensitive_key',
        key_id: keyId,
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })

      // 直接显示完整密钥
      setDecryptedKey(fullKey)
      setShowFullKey(true)
    } catch (error) {
      console.error('View key failed:', error)
      alert('查看密钥失败')
    }
  }

  const verifyKey = async (keyId, keyType, fullKey) => {
    try {
      // 记录验证日志
      await supabase.from('access_logs').insert({
        action: 'verify_key',
        key_id: keyId,
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })

      // 调用验证API
      const response = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyType, key: fullKey, keyId })
      })

      const { isValid } = await response.json()

      // 更新数据库状态
      const statusUpdateResponse = await fetch('/api/update-key-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: keyId,
          status: isValid ? 'valid' : 'invalid',
          lastVerified: new Date().toISOString()
        })
      })

      const updateResult = await statusUpdateResponse.json()
      
      if (!statusUpdateResponse.ok || !updateResult.success) {
        throw new Error('数据库更新失败: ' + (updateResult.error || updateResult.details || 'Unknown error'))
      }

      alert(`密钥验证结果: ${isValid ? '有效' : '无效'}`)
      fetchKeys() // 刷新列表
      
      // 刷新统计数据
      if (onStatsChange) {
        onStatsChange()
      }
    } catch (error) {
      console.error('Verification failed:', error)
      alert('验证失败')
    }
  }

  const getClientIP = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json')
      const data = await response.json()
      return data.ip
    } catch {
      return null
    }
  }

  const reextractKey = async (keyId) => {
    try {
      setExtractLoading(true)
      
      // 记录访问日志
      await supabase.from('access_logs').insert({
        action: 'reextract_key',
        key_id: keyId,
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })

      // 调用重新提取API
      const response = await fetch('/api/reextract-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId })
      })

      const result = await response.json()

      if (result.success) {
        const message = result.updatedCount !== undefined && result.createdCount !== undefined
          ? `重新提取成功！更新 ${result.updatedCount} 个，新建 ${result.createdCount} 个密钥`
          : `重新提取成功！发现 ${result.extractedCount} 个密钥`
        alert(message)
        fetchKeys() // 刷新列表
      } else {
        alert(`重新提取失败: ${result.error}`)
      }
    } catch (error) {
      console.error('Reextract failed:', error)
      alert('重新提取失败')
    } finally {
      setExtractLoading(false)
    }
  }

  const openManualExtractModal = (key) => {
    setManualExtractKey(key)
    setExtractedKeys('')
    setShowManualExtractModal(true)
  }

  const deleteKey = async (keyId, keyPreview) => {
    // 确认删除
    if (!confirm(`确定要删除这个密钥吗？\n\n${keyPreview}\n\n此操作不可撤销！`)) {
      return
    }

    try {
      setExtractLoading(true)
      
      // 记录访问日志
      await supabase.from('access_logs').insert({
        action: 'delete_key_request',
        key_id: keyId,
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })

      // 调用删除API
      const response = await fetch('/api/delete-key', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId })
      })

      const result = await response.json()

      if (result.success) {
        alert('密钥删除成功！')
        fetchKeys() // 刷新列表
        
        // 刷新统计数据
        if (onStatsChange) {
          onStatsChange()
        }
      } else {
        alert(`删除失败: ${result.error}`)
      }
    } catch (error) {
      console.error('Delete failed:', error)
      alert('删除失败')
    } finally {
      setExtractLoading(false)
    }
  }

  const handleManualExtract = async () => {
    if (!extractedKeys.trim()) {
      alert('请输入要提取的密钥')
      return
    }

    try {
      setExtractLoading(true)
      
      // 记录访问日志
      await supabase.from('access_logs').insert({
        action: 'manual_extract_key',
        key_id: manualExtractKey.id,
        ip_address: await getClientIP(),
        user_agent: navigator.userAgent
      })

      // 调用手工提取API
      const response = await fetch('/api/manual-extract-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          keyId: manualExtractKey.id,
          extractedKeys: extractedKeys,
          originalContext: manualExtractKey.leaked_keys_sensitive?.[0]?.raw_context
        })
      })

      const result = await response.json()

      if (result.success) {
        const message = result.updatedCount !== undefined && result.createdCount !== undefined
          ? `手工提取成功！更新 ${result.updatedCount} 个，新建 ${result.createdCount} 个密钥`
          : `手工提取成功！处理了 ${result.processedCount} 个密钥`
        alert(message)
        setShowManualExtractModal(false)
        fetchKeys() // 刷新列表
      } else {
        alert(`手工提取失败: ${result.error}`)
      }
    } catch (error) {
      console.error('Manual extract failed:', error)
      alert('手工提取失败')
    } finally {
      setExtractLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计和筛选组件 */}
      <KeyStatistics 
        keys={keys} 
        onFilterChange={handleFilterChange}
        currentFilters={filters}
      />

      {/* 搜索框 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              🔍 搜索密钥
            </label>
            <input
              type="text"
              id="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1) // 搜索时重置到第一页
              }}
              placeholder="搜索仓库名、文件路径、代码上下文、密钥内容..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-3 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
            >
              清除
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-sm text-gray-600">
            📋 搜索范围：仓库名称、文件路径、密钥内容、代码上下文、编程语言、密钥类型
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            发现的API密钥 (显示 {startRecord}-{endRecord} / 共 {totalRecords} 条记录)
          </h3>
          {keys.length >= 5000 && (
            <p className="text-sm text-orange-600 mt-1">
              ⚠️ 当前显示前 {keys.length} 条记录，可能还有更多数据
            </p>
          )}
        </div>
        <div className="flex space-x-2">
          {keys.length >= 5000 && (
            <button
              onClick={() => fetchKeys(10000)}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              disabled={loading}
            >
              加载更多 (前10000条)
            </button>
          )}
          <button
            onClick={() => fetchKeys()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={loading}
          >
            刷新数据
          </button>
        </div>
      </div>

      {/* 密钥列表 - 显示筛选后的结果 */}
      <div className="space-y-4">
        {totalRecords === 0 && keys.length > 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <div className="text-yellow-600 text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-medium text-yellow-800 mb-2">无匹配结果</h3>
            <p className="text-yellow-700">
              {searchQuery ? 
                `没有找到包含 "${searchQuery}" 的密钥记录，请尝试其他搜索关键词。` :
                '当前筛选条件没有找到匹配的密钥，请尝试调整筛选条件。'
              }
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                清除搜索条件
              </button>
            )}
          </div>
        ) : (
          paginatedKeys.map((key) => (
          <div key={key.id} className="bg-white border rounded-lg p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 基本信息 */}
              <div className="lg:col-span-1">
                <div className="flex items-center space-x-2 mb-3">
                  <h3 className="font-bold text-lg text-gray-900">
                    {key.key_type.toUpperCase()}
                  </h3>
                  <SeverityBadge severity={key.severity} />
                  <ConfidenceBadge confidence={key.confidence} />
                  <StatusBadge status={key.status} />
                </div>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">仓库:</span> 
                    <a 
                      href={`https://github.com/${key.repo_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 ml-1 underline"
                    >
                      {key.repo_name}
                    </a>
                  </div>
                  
                  <div>
                    <span className="font-medium text-gray-700">文件:</span> 
                    {key.leaked_keys_sensitive?.github_url ? (
                      <a
                        href={key.leaked_keys_sensitive.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 ml-1 underline"
                      >
                        {key.file_path}
                      </a>
                    ) : (
                      <span className="ml-1 text-gray-600">{key.file_path}</span>
                    )}
                  </div>
                  
                  <div>
                    <span className="font-medium text-gray-700">语言:</span> 
                    <span className="ml-1 text-gray-600">{key.repo_language}</span>
                  </div>
                  
                  <div>
                    <span className="font-medium text-gray-700">发现时间:</span> 
                    <span className="ml-1 text-gray-600">{new Date(key.first_seen).toLocaleString('zh-CN')}</span>
                  </div>
                  
                  {key.last_verified && (
                    <div>
                      <span className="font-medium text-gray-700">验证时间:</span> 
                      <span className="ml-1 text-gray-600">{new Date(key.last_verified).toLocaleString('zh-CN')}</span>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="mt-4 space-y-2">
                  {key.leaked_keys_sensitive && (
                    <button
                      onClick={() => verifyKey(key.id, key.key_type, key.leaked_keys_sensitive.full_key)}
                      className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      验证密钥有效性
                    </button>
                  )}
                  
                  <button
                    onClick={() => reextractKey(key.id)}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    重新提取密钥
                  </button>
                  
                  <button
                    onClick={() => openManualExtractModal(key)}
                    className="w-full px-3 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
                  >
                    手工提取密钥
                  </button>
                  
                  <button
                    onClick={() => deleteKey(key.id, key.key_preview)}
                    className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    disabled={extractLoading}
                  >
                    {extractLoading ? '删除中...' : '删除密钥'}
                  </button>
                </div>
              </div>

              {/* 完整密钥 */}
              <div className="lg:col-span-1">
                <h4 className="font-bold text-sm text-gray-700 mb-3">🔑 完整API密钥:</h4>
                {key.leaked_keys_sensitive?.full_key ? (
                  <div className="bg-red-50 border border-red-200 p-4 rounded">
                    <code className="text-sm font-mono break-all text-red-700 bg-white p-2 rounded block">
                      {key.leaked_keys_sensitive.full_key}
                    </code>
                    <div className="flex mt-3 space-x-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(key.leaked_keys_sensitive.full_key)
                          alert('完整密钥已复制到剪贴板')
                        }}
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      >
                        复制密钥
                      </button>
                      <button
                        onClick={() => viewFullKey(key.id, key.leaked_keys_sensitive.full_key)}
                        className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                      >
                        记录查看
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border p-4 rounded">
                    <code className="text-sm font-mono text-gray-500 break-all">
                      {key.key_preview}
                    </code>
                    <p className="text-xs text-gray-400 mt-2">⚠️ 完整密钥数据未找到</p>
                  </div>
                )}
              </div>

              {/* 代码上下文 */}
              <div className="lg:col-span-1">
                <h4 className="font-bold text-sm text-gray-700 mb-3">📄 代码上下文:</h4>
                {key.leaked_keys_sensitive?.raw_context || key.context_preview ? (
                  <div className="bg-gray-50 border p-4 rounded max-h-48 overflow-y-auto">
                    <code className="text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {key.leaked_keys_sensitive?.raw_context || key.context_preview}
                    </code>
                  </div>
                ) : (
                  <div className="bg-gray-50 border p-4 rounded">
                    <p className="text-xs text-gray-400">无代码上下文信息</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          ))
        )}
      </div>

      {/* 分页控件 */}
      {totalRecords > 0 && (
        <div className="bg-white border rounded-lg p-4 mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* 分页信息和每页大小选择 */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">
                显示 {startRecord}-{endRecord} / 共 {totalRecords} 条
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="pageSize" className="text-sm text-gray-700">每页:</label>
                <select
                  id="pageSize"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* 分页按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              
              {/* 页码按钮 */}
              <div className="flex items-center gap-1">
                {(() => {
                  const pages = []
                  const maxVisiblePages = 5
                  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
                  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)
                  
                  if (endPage - startPage + 1 < maxVisiblePages) {
                    startPage = Math.max(1, endPage - maxVisiblePages + 1)
                  }

                  if (startPage > 1) {
                    pages.push(
                      <button
                        key={1}
                        onClick={() => handlePageChange(1)}
                        className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                      >
                        1
                      </button>
                    )
                    if (startPage > 2) {
                      pages.push(<span key="start-ellipsis" className="px-2 text-gray-500">...</span>)
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => handlePageChange(i)}
                        className={`px-3 py-1 border rounded text-sm ${
                          i === currentPage
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="end-ellipsis" className="px-2 text-gray-500">...</span>)
                    }
                    pages.push(
                      <button
                        key={totalPages}
                        onClick={() => handlePageChange(totalPages)}
                        className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                      >
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完整密钥显示模态框 */}
      {showFullKey && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              ⚠️ 敏感信息
            </h3>
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-sm text-red-800">
                以下是完整的API密钥，请谨慎处理并确保不泄露
              </p>
            </div>
            <div className="bg-gray-100 p-3 rounded font-mono text-sm break-all">
              {decryptedKey}
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(decryptedKey)
                  alert('已复制到剪贴板')
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                复制
              </button>
              <button
                onClick={() => {
                  setShowFullKey(false)
                  setDecryptedKey('')
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手工提取密钥模态框 */}
      {showManualExtractModal && manualExtractKey && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              🔧️ 手工提取密钥 - {manualExtractKey.key_type.toUpperCase()}
            </h3>
            
            {/* 原始上下文显示 */}
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-700 mb-2">📄 原始代码上下文:</h4>
              <div className="bg-gray-50 border rounded p-4 max-h-40 overflow-y-auto">
                <code className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                  {manualExtractKey.leaked_keys_sensitive?.[0]?.raw_context || '无上下文信息'}
                </code>
              </div>
            </div>
            
            {/* 手工输入区域 */}
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-700 mb-2">🔑 提取的密钥 (每行一个):</h4>
              <textarea
                value={extractedKeys}
                onChange={(e) => setExtractedKeys(e.target.value)}
                placeholder="请输入要提取的密钥，每行一个...\n\n例如:\nsk-proj-abc123...\nsk-svcacct-def456...\nAIza789..."
                className="w-full h-40 p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            
            {/* 提示信息 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
              <p className="text-sm text-yellow-800">
                💡 <strong>提示:</strong> 请从上面的代码上下文中手动提取密钥。支持多种格式：
              </p>
              <ul className="text-xs text-yellow-700 mt-2 list-disc list-inside">
                <li>OpenAI: sk-, sk-proj-, sk-user-, sk-svcacct-</li>
                <li>Anthropic: sk-ant-</li>
                <li>Google: AIza</li>
                <li>其他服务的API密钥</li>
              </ul>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowManualExtractModal(false)
                  setManualExtractKey(null)
                  setExtractedKeys('')
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                disabled={extractLoading}
              >
                取消
              </button>
              <button
                onClick={handleManualExtract}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                disabled={extractLoading || !extractedKeys.trim()}
              >
                {extractLoading ? '处理中...' : '提取密钥'}
              </button>
            </div>
          </div>
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
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[severity]}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }) {
  const styles = {
    valid: 'bg-green-100 text-green-800',
    invalid: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-800'
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function ConfidenceBadge({ confidence }) {
  const styles = {
    high: 'bg-blue-100 text-blue-800',
    medium: 'bg-purple-100 text-purple-800',
    low: 'bg-gray-100 text-gray-800'
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[confidence]}`}>
      {confidence}
    </span>
  )
}