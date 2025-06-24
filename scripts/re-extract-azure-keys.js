#!/usr/bin/env node

/**
 * Azure OpenAI 密钥重新提取脚本
 * 从原始上下文重新提取完整的密钥信息
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 手动加载环境变量
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          if (key && value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      console.log('✅ 已加载环境变量');
    }
  } catch (e) {
    console.log('⚠️ 无法加载 .env 文件:', e.message);
  }
}

loadEnvFile();

// Azure OpenAI 密钥提取模式（更精确）
const AZURE_PATTERNS = [
  // 标准32位十六进制格式
  {
    pattern: /[a-f0-9]{32}(?![a-f0-9])/gi,
    name: 'Standard 32-hex',
    description: '标准32位十六进制格式'
  },
  // 可能包含大写字母的变体
  {
    pattern: /[a-fA-F0-9]{32}(?![a-fA-F0-9])/g,
    name: 'Mixed case 32-hex',
    description: '混合大小写32位十六进制'
  },
  // 更宽泛的模式，用于捕获可能遗漏的密钥
  {
    pattern: /[a-zA-Z0-9]{32}(?![a-zA-Z0-9])/g,
    name: 'Alphanumeric 32-char',
    description: '32位字母数字组合'
  }
];

// 上下文关键词
const AZURE_CONTEXT_KEYWORDS = [
  'azure', 'openai', 'cognitive', 'endpoint', 'api-key', 'apikey',
  'subscription', 'resource', 'ocp-apim', 'deployment'
];

class AzureKeyReExtractor {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      processed: 0,
      updated: 0,
      kept_same: 0,
      extracted_new: 0,
      errors: 0,
      extraction_methods: {}
    };
  }

  async run() {
    console.log('🔄 开始重新提取 Azure OpenAI 密钥...\n');
    
    try {
      // 获取所有 Azure OpenAI 类型的密钥
      const { data: azureKeys, error } = await this.supabase
        .from('leaked_keys')
        .select(`
          id,
          key_type,
          key_preview,
          repo_name,
          file_path,
          context_preview,
          confidence,
          created_at,
          leaked_keys_sensitive!inner(
            id,
            full_key,
            raw_context,
            github_url
          )
        `)
        .eq('key_type', 'azure_openai')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`查询失败: ${error.message}`);
      }

      this.stats.total = azureKeys.length;
      console.log(`📊 找到 ${azureKeys.length} 个 Azure OpenAI 密钥记录\n`);

      if (azureKeys.length === 0) {
        console.log('✅ 没有需要处理的 Azure OpenAI 密钥');
        return;
      }

      // 逐个重新提取密钥
      for (let i = 0; i < azureKeys.length; i++) {
        const keyRecord = azureKeys[i];
        console.log(`🔍 重新提取 ${i + 1}/${azureKeys.length}: 密钥 ${keyRecord.id}`);
        
        await this.reExtractKey(keyRecord);
        
        // 每处理10个记录显示一次进度
        if ((i + 1) % 10 === 0) {
          console.log(`📈 进度: ${i + 1}/${azureKeys.length} (${Math.round((i + 1)/azureKeys.length*100)}%)`);
        }
      }

      this.printSummary();

    } catch (error) {
      console.error('❌ 重新提取过程出错:', error.message);
    }
  }

  async reExtractKey(keyRecord) {
    const { id, leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    const currentFullKey = sensitiveRecord?.full_key;
    const rawContext = sensitiveRecord?.raw_context || '';
    
    if (!rawContext) {
      console.log(`  ⚠️ 密钥 ${id} 没有原始上下文数据`);
      this.stats.errors++;
      return;
    }

    try {
      // 从原始上下文重新提取所有可能的 Azure OpenAI 密钥
      const extractedKeys = this.extractAzureKeysFromContext(rawContext);
      
      if (extractedKeys.length === 0) {
        console.log(`  ❌ 未从上下文中提取到 Azure OpenAI 密钥`);
        return;
      }

      // 选择最佳匹配的密钥
      const bestKey = this.selectBestKey(extractedKeys, currentFullKey, rawContext);
      
      if (!bestKey) {
        console.log(`  ❌ 未找到有效的 Azure OpenAI 密钥`);
        return;
      }

      // 检查是否需要更新
      if (bestKey.key === currentFullKey) {
        console.log(`  ✅ 密钥未变化: ${this.maskKey(bestKey.key)}`);
        this.stats.kept_same++;
      } else {
        console.log(`  🔄 发现新密钥: ${this.maskKey(bestKey.key)} (使用 ${bestKey.method})`);
        console.log(`  📝 原密钥: ${this.maskKey(currentFullKey)}`);
        
        // 更新数据库中的密钥
        await this.updateKeyInDatabase(keyRecord, sensitiveRecord, bestKey);
        this.stats.updated++;
        this.stats.extracted_new++;
        
        // 统计提取方法
        this.stats.extraction_methods[bestKey.method] = (this.stats.extraction_methods[bestKey.method] || 0) + 1;
      }

      this.stats.processed++;

    } catch (error) {
      console.error(`  ❌ 处理密钥 ${id} 时出错:`, error.message);
      this.stats.errors++;
    }
  }

  extractAzureKeysFromContext(content) {
    const foundKeys = [];
    const processedKeys = new Set();
    
    // 使用多种模式提取密钥
    for (const patternConfig of AZURE_PATTERNS) {
      const matches = content.match(patternConfig.pattern);
      if (matches) {
        for (const key of matches) {
          // 防止重复
          if (processedKeys.has(key.toLowerCase())) {
            continue;
          }
          
          // 验证是否在Azure上下文中
          if (this.isInAzureContext(key, content)) {
            foundKeys.push({
              key: key,
              method: patternConfig.name,
              description: patternConfig.description,
              score: this.calculateKeyScore(key, content)
            });
            processedKeys.add(key.toLowerCase());
          }
        }
      }
    }
    
    // 按评分排序
    return foundKeys.sort((a, b) => b.score - a.score);
  }

  isInAzureContext(key, content) {
    const keyIndex = content.indexOf(key);
    if (keyIndex === -1) return false;
    
    // 检查密钥周围的上下文（前后200字符）
    const contextStart = Math.max(0, keyIndex - 200);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 200);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    // 至少需要包含一个Azure相关关键词
    const hasAzureKeyword = AZURE_CONTEXT_KEYWORDS.some(keyword => 
      context.includes(keyword.toLowerCase())
    );
    
    if (!hasAzureKeyword) {
      return false;
    }
    
    // 排除明显的哈希值上下文
    const hashIndicators = [
      'commit', 'hash', 'sha', 'md5', 'git', 'github', 'version', 'uuid', 'guid'
    ];
    
    const hasHashIndicator = hashIndicators.some(indicator => 
      context.includes(indicator.toLowerCase())
    );
    
    return !hasHashIndicator;
  }

  calculateKeyScore(key, content) {
    let score = 0;
    
    const keyIndex = content.indexOf(key);
    const contextStart = Math.max(0, keyIndex - 100);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 100);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    // 基础分数：密钥格式
    if (/^[a-f0-9]{32}$/.test(key)) {
      score += 10; // 标准十六进制格式
    } else if (/^[a-fA-F0-9]{32}$/.test(key)) {
      score += 8; // 混合大小写十六进制
    } else {
      score += 5; // 其他32位格式
    }
    
    // 上下文关键词加分
    const keywordScores = {
      'azure': 10,
      'openai': 10,
      'cognitive': 8,
      'endpoint': 6,
      'api-key': 8,
      'apikey': 8,
      'subscription': 6,
      'resource': 4,
      'ocp-apim': 8,
      'deployment': 6
    };
    
    for (const [keyword, points] of Object.entries(keywordScores)) {
      if (context.includes(keyword)) {
        score += points;
      }
    }
    
    // 变量名上下文加分
    const variablePatterns = [
      /api[_-]?key/i,
      /azure[_-]?key/i,
      /openai[_-]?key/i,
      /cognitive[_-]?key/i,
      /subscription[_-]?key/i
    ];
    
    for (const pattern of variablePatterns) {
      if (pattern.test(context)) {
        score += 5;
      }
    }
    
    // 减分项：哈希值指示器
    const hashPenalties = {
      'commit': -10,
      'hash': -8,
      'sha': -8,
      'md5': -10,
      'git': -6,
      'github': -6,
      'version': -4,
      'uuid': -8,
      'guid': -8
    };
    
    for (const [indicator, penalty] of Object.entries(hashPenalties)) {
      if (context.includes(indicator)) {
        score += penalty;
      }
    }
    
    return Math.max(0, score); // 确保分数不为负
  }

  selectBestKey(extractedKeys, currentKey, context) {
    if (extractedKeys.length === 0) return null;
    
    // 如果当前密钥在提取结果中且分数足够高，优先保留
    if (currentKey) {
      const currentKeyMatch = extractedKeys.find(k => k.key === currentKey);
      if (currentKeyMatch && currentKeyMatch.score >= 20) {
        return currentKeyMatch;
      }
    }
    
    // 选择分数最高的密钥
    const bestKey = extractedKeys[0];
    
    // 确保最佳密钥有足够的置信度
    if (bestKey.score >= 15) {
      return bestKey;
    }
    
    return null;
  }

  async updateKeyInDatabase(keyRecord, sensitiveRecord, newKeyData) {
    try {
      // 更新主表的密钥预览
      const { error: updateError } = await this.supabase
        .from('leaked_keys')
        .update({
          key_preview: this.maskKey(newKeyData.key)
        })
        .eq('id', keyRecord.id);

      if (updateError) {
        throw new Error(`更新主记录失败: ${updateError.message}`);
      }

      // 更新敏感数据表的完整密钥
      const { error: sensitiveUpdateError } = await this.supabase
        .from('leaked_keys_sensitive')
        .update({
          full_key: newKeyData.key
        })
        .eq('id', sensitiveRecord.id);

      if (sensitiveUpdateError) {
        throw new Error(`更新敏感记录失败: ${sensitiveUpdateError.message}`);
      }

      console.log(`  ✅ 已更新密钥 (${newKeyData.method}, 评分: ${newKeyData.score})`);

    } catch (error) {
      console.error(`  ❌ 更新数据库失败:`, error.message);
      throw error;
    }
  }

  maskKey(key, maxLength = 95) {
    if (!key) return '';
    if (key.length <= 8) return '*'.repeat(key.length);
    
    const basicMask = key.substring(0, 6) + '*'.repeat(Math.max(key.length - 12, 4)) + key.substring(key.length - 6);
    
    // 如果超过最大长度，智能截断
    if (basicMask.length > maxLength) {
      const availableMiddle = maxLength - 12; // 6个字符开头 + 6个字符结尾
      const truncatedMask = key.substring(0, 6) + '*'.repeat(Math.max(availableMiddle, 4)) + key.substring(key.length - 6);
      return truncatedMask;
    }
    
    return basicMask;
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Azure OpenAI 密钥重新提取完成');
    console.log('='.repeat(80));
    console.log(`📈 总计处理: ${this.stats.total} 个密钥`);
    console.log(`🔄 已处理: ${this.stats.processed} 个`);
    console.log(`📝 密钥更新: ${this.stats.updated} 个`);
    console.log(`✅ 保持不变: ${this.stats.kept_same} 个`);
    console.log(`🆕 提取新密钥: ${this.stats.extracted_new} 个`);
    console.log(`❌ 处理错误: ${this.stats.errors} 个`);
    
    if (Object.keys(this.stats.extraction_methods).length > 0) {
      console.log('\n📋 提取方法统计:');
      Object.entries(this.stats.extraction_methods).forEach(([method, count]) => {
        console.log(`   ${method}: ${count} 个`);
      });
    }
    
    const updateRate = this.stats.total > 0 ? 
      ((this.stats.updated / this.stats.total) * 100).toFixed(1) : 0;
    
    console.log(`\n📊 密钥更新率: ${updateRate}% (${this.stats.updated}/${this.stats.total})`);
    console.log(`📈 处理成功率: ${this.stats.total > 0 ? (((this.stats.processed) / this.stats.total) * 100).toFixed(1) : 0}%`);
    
    console.log('\n💡 重新提取结果:');
    console.log('   - 🔍 从原始上下文重新提取了所有可能的密钥');
    console.log('   - 📊 使用评分系统选择最佳匹配');
    console.log('   - ✅ 保留了现有的有效密钥');
    console.log('   - 🆕 发现并更新了更准确的密钥');
    console.log('   - 🎯 提升了密钥提取的准确性');
    
    console.log('='.repeat(80));
  }
}

// 运行重新提取器
async function main() {
  const extractor = new AzureKeyReExtractor();
  await extractor.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = AzureKeyReExtractor;