'use client'

import { useState } from 'react'
import supabase from '../../../lib/supabase'

export default function VerificationDebug({ onStatsChange }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [verificationProgress, setVerificationProgress] = useState({ current: 0, total: 0, isRunning: false })

  const verifyAllKeys = async () => {
    setLoading(true)
    setResult(null)
    setVerificationProgress({ current: 0, total: 0, isRunning: true })

    try {
      // 获取所有有敏感数据的密钥
      const { data: keys, error: fetchError } = await supabase
        .from('leaked_keys')
        .select('id, key_type, leaked_keys_sensitive(*)')
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw new Error('获取密钥列表失败: ' + fetchError.message)
      }

      // 筛选出有完整敏感数据的密钥
      const keysWithSensitive = keys.filter(k => 
        k.leaked_keys_sensitive && 
        k.leaked_keys_sensitive.length > 0 && 
        k.leaked_keys_sensitive[0].full_key
      )

      if (keysWithSensitive.length === 0) {
        throw new Error('没有找到可验证的密钥（需要有完整的敏感数据）')
      }

      setVerificationProgress({ current: 0, total: keysWithSensitive.length, isRunning: true })

      const results = []
      let successCount = 0
      let failureCount = 0

      console.log(`开始验证 ${keysWithSensitive.length} 个密钥...`)

      // 逐个验证密钥（避免API速率限制）
      for (let i = 0; i < keysWithSensitive.length; i++) {
        const key = keysWithSensitive[i]
        const sensitiveData = key.leaked_keys_sensitive[0]
        
        try {
          console.log(`验证密钥 ${i + 1}/${keysWithSensitive.length}: ID ${key.id} (${key.key_type})`)
          setVerificationProgress({ current: i + 1, total: keysWithSensitive.length, isRunning: true })

          // 调用验证API
          const verifyResponse = await fetch('/api/verify-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              keyType: key.key_type, 
              key: sensitiveData.full_key 
            })
          })

          const verifyResult = await verifyResponse.json()
          
          // 更新数据库状态
          const statusUpdateResponse = await fetch('/api/update-key-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keyId: key.id,
              status: verifyResult.isValid ? 'valid' : 'invalid',
              lastVerified: new Date().toISOString()
            })
          })

          const updateResult = await statusUpdateResponse.json()
          
          if (statusUpdateResponse.ok && updateResult.success) {
            successCount++
            results.push({
              id: key.id,
              type: key.key_type,
              status: verifyResult.isValid ? 'valid' : 'invalid',
              success: true,
              message: verifyResult.message || (verifyResult.isValid ? '验证有效' : '验证无效')
            })
          } else {
            failureCount++
            results.push({
              id: key.id,
              type: key.key_type,
              success: false,
              error: updateResult.error || '更新状态失败'
            })
          }

          // 添加延迟以避免API速率限制
          if (i < keysWithSensitive.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)) // 1秒延迟
          }

        } catch (error) {
          failureCount++
          results.push({
            id: key.id,
            type: key.key_type,
            success: false,
            error: error.message
          })
          console.error(`验证密钥 ${key.id} 失败:`, error)
        }
      }

      setVerificationProgress({ current: keysWithSensitive.length, total: keysWithSensitive.length, isRunning: false })

      setResult({
        success: true,
        message: `批量验证完成: 成功 ${successCount}, 失败 ${failureCount}`,
        results: results.slice(0, 20), // 只显示前20个结果
        summary: {
          total: keysWithSensitive.length,
          success: successCount,
          failure: failureCount
        }
      })

      // 刷新统计数据
      if (onStatsChange) {
        onStatsChange()
      }

    } catch (error) {
      console.error('Batch verification failed:', error)
      setResult({
        success: false,
        message: '批量验证失败: ' + error.message
      })
      setVerificationProgress({ current: 0, total: 0, isRunning: false })
    } finally {
      setLoading(false)
    }
  }

  const checkDatabaseStatus = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('leaked_keys')
        .select('id, status, last_verified')
        .order('id', { ascending: false })
        .limit(10)

      if (error) throw error

      const statusCounts = {
        valid: data.filter(k => k.status === 'valid').length,
        invalid: data.filter(k => k.status === 'invalid').length,
        unknown: data.filter(k => k.status === 'unknown').length
      }

      setResult({
        success: true,
        message: '数据库状态检查完成',
        statusCounts,
        recentKeys: data
      })
    } catch (error) {
      setResult({
        success: false,
        message: '数据库检查失败: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  const testBatchVerification = async () => {
    setLoading(true)
    setResult(null)

    try {
      // 1. 获取前5个密钥进行测试
      const { data: keys, error: fetchError } = await supabase
        .from('leaked_keys')
        .select('id, key_type, status, leaked_keys_sensitive(*)')
        .limit(5)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw new Error('获取密钥失败: ' + fetchError.message)
      }

      console.log('Found keys for testing:', keys)

      const results = []

      // 2. 批量更新状态进行测试
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const testStatus = ['valid', 'invalid', 'unknown'][i % 3]
        
        try {
          console.log(`Updating key ${key.id} from ${key.status} to ${testStatus}`)
          
          // 使用API端点更新状态
          const response = await fetch('/api/update-key-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keyId: key.id,
              status: testStatus,
              lastVerified: new Date().toISOString()
            })
          })

          const result = await response.json()
          
          if (!response.ok || !result.success) {
            console.error('Update error:', result)
            throw new Error('更新失败: ' + (result.error || result.details || 'Unknown error'))
          }

          console.log('Update result:', result)

          results.push({
            id: key.id,
            type: key.key_type,
            oldStatus: key.status,
            newStatus: testStatus,
            success: true
          })
        } catch (error) {
          results.push({
            id: key.id,
            type: key.key_type,
            error: error.message,
            success: false
          })
        }
      }

      setResult({
        success: true,
        message: '批量验证测试完成',
        results: results
      })

      // 刷新统计数据
      if (onStatsChange) {
        onStatsChange()
      }

    } catch (error) {
      console.error('Batch verification failed:', error)
      setResult({
        success: false,
        message: '批量验证失败: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  const resetAllStatus = async () => {
    setLoading(true)
    setResult(null)

    try {
      // 使用API端点重置所有状态
      const response = await fetch('/api/reset-all-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error('重置状态失败: ' + (result.error || result.details || 'Unknown error'))
      }

      setResult({
        success: true,
        message: result.message || '所有密钥状态已重置为unknown'
      })

      // 刷新统计数据
      if (onStatsChange) {
        onStatsChange()
      }

    } catch (error) {
      setResult({
        success: false,
        message: '重置失败: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  const testSingleVerification = async () => {
    setLoading(true)
    setResult(null)

    try {
      // 获取一个有敏感数据的密钥
      const { data: keys, error: fetchError } = await supabase
        .from('leaked_keys')
        .select('id, key_type, leaked_keys_sensitive(*)')
        .limit(10) // 获取更多记录以便查找有敏感数据的

      if (fetchError || !keys || keys.length === 0) {
        throw new Error('没有找到可测试的密钥')
      }

      // 查找第一个有完整敏感数据的密钥
      const keyWithSensitive = keys.find(k => 
        k.leaked_keys_sensitive && 
        k.leaked_keys_sensitive.length > 0 && 
        k.leaked_keys_sensitive[0].full_key
      )

      if (!keyWithSensitive) {
        throw new Error(`在${keys.length}个密钥中没有找到完整的敏感数据。请检查数据库是否正确存储了敏感信息。`)
      }

      const key = keyWithSensitive
      const sensitiveData = key.leaked_keys_sensitive[0]
      console.log('Testing key:', key)
      console.log('Sensitive data available:', !!sensitiveData.full_key)

      // 调用验证API
      const response = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          keyType: key.key_type, 
          key: sensitiveData.full_key 
        })
      })

      const apiResult = await response.json()
      console.log('API result:', apiResult)

      // 更新数据库状态
      const statusUpdateResponse = await fetch('/api/update-key-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: key.id,
          status: apiResult.isValid ? 'valid' : 'invalid',
          lastVerified: new Date().toISOString()
        })
      })

      const updateResult = await statusUpdateResponse.json()
      
      if (!statusUpdateResponse.ok || !updateResult.success) {
        throw new Error('数据库更新失败: ' + (updateResult.error || updateResult.details || 'Unknown error'))
      }

      setResult({
        success: true,
        message: '单个密钥验证测试完成',
        keyId: key.id,
        keyType: key.key_type,
        apiResponse: apiResult,
        verified: apiResult.isValid ? 'valid' : 'invalid'
      })

      // 刷新统计数据
      if (onStatsChange) {
        onStatsChange()
      }

    } catch (error) {
      console.error('Single verification failed:', error)
      setResult({
        success: false,
        message: '单个验证失败: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">🔧 验证状态调试</h3>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={verifyAllKeys}
            disabled={loading || verificationProgress.isRunning}
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 col-span-2"
          >
            {verificationProgress.isRunning 
              ? `验证中... (${verificationProgress.current}/${verificationProgress.total})` 
              : loading ? '处理中...' : '🚀 批量验证所有密钥'}
          </button>
          
          <button
            onClick={testBatchVerification}
            disabled={loading || verificationProgress.isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '批量测试验证状态'}
          </button>
          
          <button
            onClick={testSingleVerification}
            disabled={loading || verificationProgress.isRunning}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '测试单个密钥验证'}
          </button>
          
          <button
            onClick={resetAllStatus}
            disabled={loading || verificationProgress.isRunning}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '重置所有状态'}
          </button>

          <button
            onClick={checkDatabaseStatus}
            disabled={loading || verificationProgress.isRunning}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '检查数据库状态'}
          </button>
        </div>

        {/* 进度条 */}
        {verificationProgress.isRunning && (
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-blue-700">批量验证进度</span>
              <span className="text-sm text-blue-600">
                {verificationProgress.current} / {verificationProgress.total}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ 
                  width: `${verificationProgress.total > 0 ? (verificationProgress.current / verificationProgress.total) * 100 : 0}%` 
                }}
              ></div>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              正在逐个验证密钥，每个密钥间隔1秒以避免API速率限制...
            </p>
          </div>
        )}

        {result && (
          <div className={`p-4 rounded ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
            <h4 className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              调试结果
            </h4>
            <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'} mt-2`}>
              {result.message}
            </p>
            {result.results && (
              <div className="mt-3">
                <h5 className="font-medium text-gray-700">详细结果:</h5>
                <ul className="text-sm mt-1 space-y-1">
                  {result.results.map((r, index) => (
                    <li key={index} className={r.success ? 'text-green-600' : 'text-red-600'}>
                      ID {r.id} ({r.type}): {r.success ? `${r.oldStatus} → ${r.newStatus}` : r.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.apiResponse && (
              <div className="mt-3">
                <h5 className="font-medium text-gray-700">API响应:</h5>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(result.apiResponse, null, 2)}
                </pre>
              </div>
            )}
            {result.statusCounts && (
              <div className="mt-3">
                <h5 className="font-medium text-gray-700">状态统计:</h5>
                <div className="text-sm mt-1">
                  <span className="text-green-600">Valid: {result.statusCounts.valid}</span> | 
                  <span className="text-red-600 ml-2">Invalid: {result.statusCounts.invalid}</span> | 
                  <span className="text-gray-600 ml-2">Unknown: {result.statusCounts.unknown}</span>
                </div>
              </div>
            )}
            {result.recentKeys && (
              <div className="mt-3">
                <h5 className="font-medium text-gray-700">最近10条记录:</h5>
                <div className="text-xs mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {result.recentKeys.map(key => (
                    <div key={key.id} className="flex justify-between">
                      <span>ID {key.id}</span>
                      <span className={key.status === 'valid' ? 'text-green-600' : key.status === 'invalid' ? 'text-red-600' : 'text-gray-600'}>
                        {key.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.summary && (
              <div className="mt-3">
                <h5 className="font-medium text-gray-700">验证总结:</h5>
                <div className="text-sm mt-1 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{result.summary.total}</div>
                    <div className="text-xs text-gray-500">总数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{result.summary.success}</div>
                    <div className="text-xs text-gray-500">成功</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-600">{result.summary.failure}</div>
                    <div className="text-xs text-gray-500">失败</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <h4 className="font-medium text-blue-800 mb-2">🤖 自动验证系统</h4>
          <div className="text-sm text-blue-700 space-y-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span><strong>新密钥自动验证</strong>: 扫描器发现新密钥时自动验证</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span><strong>定时批量验证</strong>: 每天6点自动验证未验证的密钥</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              <span><strong>智能跳过</strong>: 避免重复验证已确认的密钥</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-blue-600">
            💡 大多数情况下，您不需要手动验证。系统会自动处理新发现的密钥。
          </div>
        </div>

        <div className="text-sm text-gray-500">
          <p>手动操作说明:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>批量验证所有密钥</strong>: 逐个验证所有有完整数据的密钥，调用真实API检查有效性</li>
            <li>批量测试: 将前5个密钥分别设置为valid/invalid/unknown状态（仅测试用）</li>
            <li>单个验证: 测试真实的API验证流程</li>
            <li>重置状态: 将所有密钥状态重置为unknown</li>
            <li>检查状态: 查看数据库中当前的状态分布和最近记录</li>
          </ul>
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-xs text-yellow-700">
              ⚠️ 手动批量验证会逐个调用真实API，可能需要较长时间。过程中会有1秒延迟以避免速率限制。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}