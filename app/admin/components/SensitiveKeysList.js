'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function SensitiveKeysList({ user }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [showFullKey, setShowFullKey] = useState(false)
  const [decryptedKey, setDecryptedKey] = useState('')

  useEffect(() => {
    fetchKeys()
  }, [])

  const fetchKeys = async () => {
    try {
      const { data } = await supabase
        .from('leaked_keys')
        .select(`
          *,
          leaked_keys_sensitive (
            full_key,
            raw_context,
            github_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      setKeys(data || [])
    } catch (error) {
      console.error('Failed to fetch keys:', error)
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
        body: JSON.stringify({ keyType, key: fullKey })
      })

      const { isValid } = await response.json()

      // 更新数据库状态
      await supabase
        .from('leaked_keys')
        .update({ 
          status: isValid ? 'valid' : 'invalid',
          last_verified: new Date().toISOString()
        })
        .eq('id', keyId)

      alert(`密钥验证结果: ${isValid ? '有效' : '无效'}`)
      fetchKeys() // 刷新列表
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

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          敏感密钥管理 ({keys.length} 条记录)
        </h3>
        <button
          onClick={fetchKeys}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          刷新
        </button>
      </div>

      {/* 密钥列表 */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {keys.map((key) => (
            <li key={key.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {key.key_type.toUpperCase()} - {key.key_preview}
                      </p>
                      <p className="text-sm text-gray-500">
                        {key.repo_name} • {key.file_path}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <SeverityBadge severity={key.severity} />
                      <StatusBadge status={key.status} />
                      <ConfidenceBadge confidence={key.confidence} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">
                      发现时间: {new Date(key.first_seen).toLocaleString('zh-CN')}
                    </p>
                    {key.last_verified && (
                      <p className="text-sm text-gray-600">
                        验证时间: {new Date(key.last_verified).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col space-y-2 ml-4">
                  {key.leaked_keys_sensitive && (
                    <>
                      <button
                        onClick={() => viewFullKey(key.id, key.leaked_keys_sensitive.full_key)}
                        className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                      >
                        查看完整密钥
                      </button>
                      <button
                        onClick={() => verifyKey(key.id, key.key_type, key.leaked_keys_sensitive.full_key)}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      >
                        验证密钥
                      </button>
                      {key.leaked_keys_sensitive.github_url && (
                        <a
                          href={key.leaked_keys_sensitive.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 text-center"
                        >
                          查看源码
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* 上下文预览 */}
              {key.context_preview && (
                <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                  <p className="font-medium text-gray-700 mb-1">代码上下文:</p>
                  <code className="text-gray-600">{key.context_preview}</code>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

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