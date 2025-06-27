'use client'

import { useState } from 'react'
import supabase from '../../../lib/supabase'

// 浏览器兼容的SHA-256哈希函数
async function hashKey(key) {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function BulkKeyImport({ onStatsChange }) {
  const [importText, setImportText] = useState('')
  const [selectedService, setSelectedService] = useState('OpenAI')
  const [selectedSeverity, setSelectedSeverity] = useState('medium')
  const [selectedConfidence, setSelectedConfidence] = useState('medium')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceType, setSourceType] = useState('manual_import')
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState(null)
  const [previewKeys, setPreviewKeys] = useState([])
  const [showPreview, setShowPreview] = useState(false)

  // 服务类型选项
  const serviceOptions = [
    'OpenAI',
    'Anthropic',
    'Google AI',
    'Cohere',
    'Hugging Face',
    'Replicate',
    'Azure OpenAI',
    'AWS Bedrock',
    'Mistral AI',
    'Perplexity AI',
    'xAI (Grok)',
    'GitHub',
    'GitLab',
    'Custom API'
  ]

  // 数据源类型选项
  const sourceTypeOptions = [
    { value: 'manual_import', label: '手动导入' },
    { value: 'github_repository', label: 'GitHub 仓库' },
    { value: 'gitlab_repository', label: 'GitLab 仓库' },
    { value: 'github_gist', label: 'GitHub Gist' },
    { value: 'pastebin', label: 'Pastebin' },
    { value: 'other_platform', label: '其他平台' },
    { value: 'leaked_database', label: '泄露数据库' },
    { value: 'security_report', label: '安全报告' }
  ]

  // 密钥模式定义
  const keyPatterns = {
    'OpenAI': [
      { regex: /sk-[a-zA-Z0-9]{48}/g, description: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { regex: /sk-proj-[a-zA-Z0-9]{48}/g, description: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'Anthropic': [
      { regex: /sk-ant-api03-[a-zA-Z0-9_-]{95}/g, description: 'sk-ant-api03-xxxxx...' }
    ],
    'Google AI': [
      { regex: /AIza[0-9A-Za-z_-]{35}/g, description: 'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'Cohere': [
      { regex: /[a-zA-Z0-9]{40}/g, description: '40字符API密钥' }
    ],
    'Hugging Face': [
      { regex: /hf_[a-zA-Z0-9]{34}/g, description: 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'Replicate': [
      { regex: /r8_[a-zA-Z0-9]{40}/g, description: 'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'Azure OpenAI': [
      { regex: /[a-f0-9]{32}/g, description: '32位十六进制密钥' }
    ],
    'AWS Bedrock': [
      { regex: /AKIA[0-9A-Z]{16}/g, description: 'AKIAXXXXXXXXXXXXXXXX' }
    ],
    'Mistral AI': [
      { regex: /[a-zA-Z0-9]{32}/g, description: '32字符API密钥' }
    ],
    'Perplexity AI': [
      { regex: /pplx-[a-zA-Z0-9]{56}/g, description: 'pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'xAI (Grok)': [
      { regex: /xai-[a-zA-Z0-9]{56}/g, description: 'xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'GitHub': [
      { regex: /ghp_[a-zA-Z0-9]{36}/g, description: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { regex: /gho_[a-zA-Z0-9]{36}/g, description: 'gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { regex: /ghu_[a-zA-Z0-9]{36}/g, description: 'ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { regex: /ghs_[a-zA-Z0-9]{36}/g, description: 'ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { regex: /ghr_[a-zA-Z0-9]{36}/g, description: 'ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    ],
    'GitLab': [
      { regex: /glpat-[a-zA-Z0-9_-]{20}/g, description: 'glpat-xxxxxxxxxxxxxxxxxxxx' }
    ]
  }

  // 预览密钥提取
  const previewExtraction = () => {
    if (!importText.trim()) {
      setPreviewKeys([])
      setShowPreview(false)
      return
    }

    const patterns = keyPatterns[selectedService] || []
    const foundKeys = []
    
    patterns.forEach(pattern => {
      const matches = importText.match(pattern.regex) || []
      matches.forEach(key => {
        if (!foundKeys.some(k => k.key === key)) {
          foundKeys.push({
            key,
            service: selectedService,
            pattern: pattern.description,
            confidence: selectedConfidence,
            severity: selectedSeverity
          })
        }
      })
    })

    setPreviewKeys(foundKeys)
    setShowPreview(true)
  }

  // 处理批量导入
  const handleBulkImport = async () => {
    if (!importText.trim()) {
      alert('请输入要导入的内容')
      return
    }

    setIsProcessing(true)
    setResults(null)

    try {
      const patterns = keyPatterns[selectedService] || []
      const foundKeys = []
      
      // 提取所有匹配的密钥
      patterns.forEach(pattern => {
        const matches = importText.match(pattern.regex) || []
        matches.forEach(key => {
          if (!foundKeys.some(k => k.key === key)) {
            foundKeys.push({
              key,
              service: selectedService,
              confidence: selectedConfidence,
              severity: selectedSeverity,
              source_url: sourceUrl || null,
              source_type: sourceType
            })
          }
        })
      })

      if (foundKeys.length === 0) {
        setResults({
          success: false,
          message: `未在输入内容中找到 ${selectedService} 格式的密钥`,
          imported: 0,
          duplicates: 0,
          errors: 0
        })
        setIsProcessing(false)
        return
      }

      // 批量处理密钥
      let imported = 0
      let duplicates = 0
      let errors = 0

      for (const keyData of foundKeys) {
        try {
          const keyHash = await hashKey(keyData.key)
          
          // 检查重复
          const { data: existing } = await supabase
            .from('leaked_keys')
            .select('id')
            .eq('key_hash', keyHash)
            .single()

          if (existing) {
            duplicates++
            continue
          }

          // 插入新密钥
          const { error } = await supabase
            .from('leaked_keys')
            .insert({
              service: keyData.service,
              key_partial: keyData.key.substring(0, 10) + '...',
              key_hash: keyHash,
              confidence: keyData.confidence,
              severity: keyData.severity,
              status: 'unverified',
              source_url: keyData.source_url,
              source_type: keyData.source_type,
              file_path: null,
              repository_name: null,
              repository_owner: null,
              found_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            })

          if (error) {
            console.error('插入失败:', error)
            errors++
          } else {
            imported++
          }
        } catch (error) {
          console.error('处理密钥失败:', error)
          errors++
        }
      }

      setResults({
        success: imported > 0,
        message: `批量导入完成`,
        total: foundKeys.length,
        imported,
        duplicates,
        errors
      })

      // 清空输入
      if (imported > 0) {
        setImportText('')
        setPreviewKeys([])
        setShowPreview(false)
        
        // 刷新统计数据
        if (onStatsChange) {
          onStatsChange()
        }
      }

    } catch (error) {
      console.error('批量导入失败:', error)
      setResults({
        success: false,
        message: '批量导入失败: ' + error.message,
        imported: 0,
        duplicates: 0,
        errors: 1
      })
    }

    setIsProcessing(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          📥 批量导入密钥
        </h2>
        
        {/* 配置选项 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              密钥类型
            </label>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {serviceOptions.map(service => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              严重程度
            </label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="low">低危</option>
              <option value="medium">中危</option>
              <option value="high">高危</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              置信度
            </label>
            <select
              value={selectedConfidence}
              onChange={(e) => setSelectedConfidence(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              数据源类型
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {sourceTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 来源URL (可选) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            来源URL (可选)
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://github.com/user/repo 或其他来源链接"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* 密钥格式提示 */}
        <div className="mb-4 p-4 bg-blue-50 rounded-md">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            {selectedService} 密钥格式:
          </h3>
          <div className="text-sm text-blue-700">
            {keyPatterns[selectedService]?.map((pattern, index) => (
              <div key={index} className="font-mono text-xs mb-1">
                {pattern.description}
              </div>
            )) || <div>此服务类型暂不支持自动检测，请手动配置模式</div>}
          </div>
        </div>

        {/* 文本输入区域 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            待导入内容
          </label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="粘贴包含API密钥的文本内容，系统将自动识别并提取密钥..."
            rows={8}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex space-x-4">
          <button
            onClick={previewExtraction}
            disabled={!importText.trim()}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            🔍 预览提取
          </button>
          
          <button
            onClick={handleBulkImport}
            disabled={!importText.trim() || isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? '⏳ 处理中...' : '📥 批量导入'}
          </button>
        </div>
      </div>

      {/* 预览结果 */}
      {showPreview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            🔍 提取预览 ({previewKeys.length} 个密钥)
          </h3>
          
          {previewKeys.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {previewKeys.map((key, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div className="flex-1">
                    <div className="font-mono text-sm text-gray-800">
                      {key.key.substring(0, 20)}...
                    </div>
                    <div className="text-xs text-gray-500">
                      {key.service} - {key.pattern}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <span className={`px-2 py-1 text-xs rounded ${
                      key.severity === 'high' ? 'bg-red-100 text-red-800' :
                      key.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {key.severity}
                    </span>
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {key.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              未找到匹配的 {selectedService} 密钥格式
            </div>
          )}
        </div>
      )}

      {/* 导入结果 */}
      {results && (
        <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${
          results.success ? 'border-green-500' : 'border-red-500'
        }`}>
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {results.success ? '✅' : '❌'} 导入结果
          </h3>
          
          <div className="space-y-2">
            <p className="text-gray-700">{results.message}</p>
            
            {results.total && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.total}</div>
                  <div className="text-sm text-gray-500">检测到</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{results.imported}</div>
                  <div className="text-sm text-gray-500">已导入</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{results.duplicates}</div>
                  <div className="text-sm text-gray-500">重复跳过</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{results.errors}</div>
                  <div className="text-sm text-gray-500">导入失败</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="bg-yellow-50 rounded-lg p-6">
        <h3 className="text-sm font-medium text-yellow-900 mb-2">
          💡 使用说明
        </h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• 粘贴包含API密钥的文本内容，系统会自动识别匹配的密钥格式</li>
          <li>• 支持从GitHub、GitLab、配置文件、日志等各种来源导入</li>
          <li>• 系统会自动去重，避免重复导入相同的密钥</li>
          <li>• 建议先使用"预览提取"功能确认识别结果</li>
          <li>• 导入的密钥状态默认为"未验证"，需要后续手动或自动验证</li>
        </ul>
      </div>
    </div>
  )
}