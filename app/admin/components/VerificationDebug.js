'use client'

import { useState } from 'react'
import supabase from '../../../lib/supabase'

export default function VerificationDebug({ onStatsChange }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

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
          const { error: updateError } = await supabase
            .from('leaked_keys')
            .update({ 
              status: testStatus,
              last_verified: new Date().toISOString()
            })
            .eq('id', key.id)

          if (updateError) {
            throw new Error('更新失败: ' + updateError.message)
          }

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
      // 先获取所有密钥ID，然后批量更新
      const { data: allKeys, error: fetchError } = await supabase
        .from('leaked_keys')
        .select('id')
      
      if (fetchError) {
        throw new Error('获取密钥列表失败: ' + fetchError.message)
      }

      if (!allKeys || allKeys.length === 0) {
        throw new Error('没有找到任何密钥')
      }

      // 使用IN子句批量更新
      const keyIds = allKeys.map(k => k.id)
      const { error } = await supabase
        .from('leaked_keys')
        .update({ 
          status: 'unknown',
          last_verified: null
        })
        .in('id', keyIds)

      if (error) {
        throw new Error('重置状态失败: ' + error.message)
      }

      setResult({
        success: true,
        message: '所有密钥状态已重置为unknown'
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

      // 更新数据库
      const { error: updateError } = await supabase
        .from('leaked_keys')
        .update({ 
          status: apiResult.isValid ? 'valid' : 'invalid',
          last_verified: new Date().toISOString()
        })
        .eq('id', key.id)

      if (updateError) {
        throw new Error('数据库更新失败: ' + updateError.message)
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
        <div className="flex space-x-4">
          <button
            onClick={testBatchVerification}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '批量测试验证状态'}
          </button>
          
          <button
            onClick={testSingleVerification}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '测试单个密钥验证'}
          </button>
          
          <button
            onClick={resetAllStatus}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '重置所有状态'}
          </button>
        </div>

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
          </div>
        )}

        <div className="text-sm text-gray-500">
          <p>说明:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>批量测试: 将前5个密钥分别设置为valid/invalid/unknown状态</li>
            <li>单个验证: 测试真实的API验证流程</li>
            <li>重置状态: 将所有密钥状态重置为unknown</li>
          </ul>
        </div>
      </div>
    </div>
  )
}