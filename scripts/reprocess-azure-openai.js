#!/usr/bin/env node

/**
 * Azure OpenAI 数据重新处理脚本
 * 重新提取和分类，避免丢失有效数据
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

// 导入模式定义
const KEY_PATTERNS = {
  openrouter: {
    pattern: /sk-or-v1-[a-f0-9]{64}(?![a-f0-9])|sk-or-[a-zA-Z0-9-]{32,70}(?![a-zA-Z0-9-])/g,
    name: 'OpenRouter',
    confidence: 'high'
  },
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+(?![a-zA-Z0-9-])/g,
    name: 'OpenAI',
    confidence: 'high',
    context_exclude: ['deepseek', 'claude', 'anthropic']
  },
  openai_project: {
    pattern: /sk-proj-[a-zA-Z0-9]{40,100}/g,
    name: 'OpenAI Project',
    confidence: 'high'
  },
  groq: {
    pattern: /gsk_[a-zA-Z0-9]{52}/g,
    name: 'Groq',
    confidence: 'high'
  },
  google: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google AI',
    confidence: 'high'
  },
  gemini: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google Gemini',
    confidence: 'high'
  },
  vertex_ai: {
    pattern: /[a-zA-Z0-9_-]{40,}/g,
    name: 'Vertex AI',
    confidence: 'medium',
    context_required: ['vertex', 'google']
  },
  azure_openai: {
    pattern: /[a-f0-9]{32}(?![a-f0-9])/g,
    name: 'Azure OpenAI',
    confidence: 'low',
    context_required: ['azure', 'openai'],
    context_exclude: ['github', 'git', 'commit', 'hash', 'sha', 'md5', 'token', 'uuid', 'id'],
    min_context_matches: 2,
    strict_validation: true
  }
};

class AzureOpenAIReprocessor {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      reprocessed: 0,
      reclassified: 0,
      kept_azure: 0,
      deleted: 0,
      errors: 0,
      classifications: {}
    };
  }

  async run() {
    console.log('🔄 开始重新处理 Azure OpenAI 密钥...\n');
    
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

      // 逐个重新处理密钥
      for (let i = 0; i < azureKeys.length; i++) {
        const keyRecord = azureKeys[i];
        console.log(`🔍 重新处理 ${i + 1}/${azureKeys.length}: 密钥 ${keyRecord.id}`);
        
        await this.reprocessKey(keyRecord);
        
        // 每处理10个记录显示一次进度
        if ((i + 1) % 10 === 0) {
          console.log(`📈 进度: ${i + 1}/${azureKeys.length} (${Math.round((i + 1)/azureKeys.length*100)}%)`);
        }
      }

      this.printSummary();

    } catch (error) {
      console.error('❌ 重新处理过程出错:', error.message);
    }
  }

  async reprocessKey(keyRecord) {
    const { id, leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    const fullKey = sensitiveRecord?.full_key;
    const rawContext = sensitiveRecord?.raw_context || '';
    
    if (!fullKey) {
      console.log(`  ⚠️ 密钥 ${id} 没有完整密钥数据`);
      this.stats.errors++;
      return;
    }

    try {
      // 在原始上下文中重新检测所有可能的密钥类型
      const detectedKeys = this.detectAllKeyTypes(rawContext, fullKey);
      
      if (detectedKeys.length === 0) {
        console.log(`  ❌ 未检测到有效密钥类型，删除记录`);
        await this.deleteKeyRecord(id, sensitiveRecord.id);
        this.stats.deleted++;
        return;
      }

      // 按置信度排序，选择最佳匹配
      const bestMatch = detectedKeys[0];
      
      if (bestMatch.type === 'azure_openai') {
        // 仍然是 Azure OpenAI，验证是否真的有效
        const isValid = this.validateAzureOpenAI(bestMatch.key, rawContext);
        
        if (isValid) {
          console.log(`  ✅ 确认为有效的 Azure OpenAI 密钥`);
          this.stats.kept_azure++;
        } else {
          console.log(`  ❌ Azure OpenAI 验证失败，删除记录`);
          await this.deleteKeyRecord(id, sensitiveRecord.id);
          this.stats.deleted++;
        }
      } else {
        // 需要重新分类
        console.log(`  🔄 重新分类为 ${bestMatch.type}: ${this.maskKey(bestMatch.key)}`);
        await this.reclassifyKey(keyRecord, sensitiveRecord, bestMatch);
        this.stats.reclassified++;
        
        // 统计重新分类的类型
        this.stats.classifications[bestMatch.type] = (this.stats.classifications[bestMatch.type] || 0) + 1;
      }

      this.stats.reprocessed++;

    } catch (error) {
      console.error(`  ❌ 处理密钥 ${id} 时出错:`, error.message);
      this.stats.errors++;
    }
  }

  detectAllKeyTypes(content, originalKey) {
    const foundKeys = [];
    const processedKeys = new Set();
    
    // 按置信度排序模式
    const sortedPatterns = Object.entries(KEY_PATTERNS).sort((a, b) => {
      const confidenceOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      return confidenceOrder[a[1].confidence] - confidenceOrder[b[1].confidence];
    });
    
    for (const [type, config] of sortedPatterns) {
      const matches = content.match(config.pattern);
      if (matches) {
        for (const key of matches) {
          // 防止重复处理
          if (processedKeys.has(key)) {
            continue;
          }
          
          // 验证上下文
          if (config.confidence === 'low' && !this.hasValidContext(key, content, type)) {
            continue;
          }
          
          // 检查排除的上下文
          if (config.context_exclude && this.hasExcludedContext(key, content, config.context_exclude)) {
            continue;
          }
          
          foundKeys.push({
            key,
            type,
            confidence: config.confidence,
            config
          });
          
          processedKeys.add(key);
        }
      }
    }
    
    return foundKeys;
  }

  hasValidContext(key, content, type) {
    const keyIndex = content.indexOf(key);
    const contextStart = Math.max(0, keyIndex - 200);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 200);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    const keyConfig = KEY_PATTERNS[type];
    const requiredContexts = keyConfig?.context_required || [];
    const minMatches = keyConfig?.min_context_matches || 1;
    
    if (requiredContexts.length === 0) return true;
    
    const matchingContexts = requiredContexts.filter(ctx => context.includes(ctx.toLowerCase()));
    return matchingContexts.length >= minMatches;
  }

  hasExcludedContext(key, content, excludeList) {
    const keyIndex = content.indexOf(key);
    const contextStart = Math.max(0, keyIndex - 200);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 200);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    return excludeList.some(excludeKeyword => context.includes(excludeKeyword.toLowerCase()));
  }

  validateAzureOpenAI(key, context) {
    // 严格验证 Azure OpenAI
    const contextLower = context.toLowerCase();
    
    // 1. 必须包含 azure 和 openai
    const hasAzure = contextLower.includes('azure');
    const hasOpenai = contextLower.includes('openai');
    
    if (!hasAzure || !hasOpenai) {
      return false;
    }
    
    // 2. 不能在注释中
    if (this.isInComment(key, context)) {
      return false;
    }
    
    // 3. 不能有排除的关键词
    const excludeKeywords = ['github', 'git', 'commit', 'hash', 'sha', 'md5', 'token', 'uuid', 'id'];
    const hasExcluded = excludeKeywords.some(keyword => contextLower.includes(keyword));
    
    if (hasExcluded) {
      return false;
    }
    
    return true;
  }

  isInComment(key, content) {
    const keyIndex = content.indexOf(key);
    if (keyIndex === -1) return false;

    const lines = content.split('\n');
    let currentPos = 0;
    
    for (const line of lines) {
      if (currentPos <= keyIndex && keyIndex < currentPos + line.length) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#') || 
            trimmedLine.startsWith('<!--') || trimmedLine.includes('* ')) {
          return true;
        }
        break;
      }
      currentPos += line.length + 1;
    }
    
    return false;
  }

  async reclassifyKey(keyRecord, sensitiveRecord, newMatch) {
    try {
      // 更新主表的密钥类型
      const { error: updateError } = await this.supabase
        .from('leaked_keys')
        .update({
          key_type: newMatch.type,
          key_preview: this.maskKey(newMatch.key),
          confidence: newMatch.confidence
        })
        .eq('id', keyRecord.id);

      if (updateError) {
        throw new Error(`更新主记录失败: ${updateError.message}`);
      }

      // 更新敏感数据表的完整密钥
      const { error: sensitiveUpdateError } = await this.supabase
        .from('leaked_keys_sensitive')
        .update({
          full_key: newMatch.key
        })
        .eq('id', sensitiveRecord.id);

      if (sensitiveUpdateError) {
        throw new Error(`更新敏感记录失败: ${sensitiveUpdateError.message}`);
      }

      console.log(`  ✅ 已重新分类为 ${newMatch.type} (${newMatch.confidence} 置信度)`);

    } catch (error) {
      console.error(`  ❌ 重新分类失败:`, error.message);
      throw error;
    }
  }

  async deleteKeyRecord(keyId, sensitiveId) {
    try {
      // 删除敏感数据记录
      if (sensitiveId) {
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .eq('id', sensitiveId);

        if (sensitiveError) {
          throw new Error(`删除敏感数据失败: ${sensitiveError.message}`);
        }
      }

      // 删除主记录
      const { error: mainError } = await this.supabase
        .from('leaked_keys')
        .delete()
        .eq('id', keyId);

      if (mainError) {
        throw new Error(`删除主记录失败: ${mainError.message}`);
      }

      console.log(`  🗑️ 已删除无效记录 ${keyId}`);

    } catch (error) {
      console.error(`  ❌ 删除记录时出错:`, error.message);
      throw error;
    }
  }

  maskKey(key) {
    if (!key || key.length < 8) return key;
    return key.substring(0, 4) + '*'.repeat(Math.max(0, key.length - 8)) + key.substring(key.length - 4);
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Azure OpenAI 密钥重新处理完成');
    console.log('='.repeat(80));
    console.log(`📈 总计处理: ${this.stats.total} 个密钥`);
    console.log(`🔄 已重新处理: ${this.stats.reprocessed} 个`);
    console.log(`✅ 保留 Azure OpenAI: ${this.stats.kept_azure} 个`);
    console.log(`🔄 重新分类: ${this.stats.reclassified} 个`);
    console.log(`🗑️ 删除无效: ${this.stats.deleted} 个`);
    console.log(`❌ 处理错误: ${this.stats.errors} 个`);
    
    if (Object.keys(this.stats.classifications).length > 0) {
      console.log('\n📋 重新分类统计:');
      Object.entries(this.stats.classifications).forEach(([type, count]) => {
        console.log(`   ${type}: ${count} 个`);
      });
    }
    
    const salvageRate = this.stats.total > 0 ? 
      (((this.stats.kept_azure + this.stats.reclassified) / this.stats.total) * 100).toFixed(1) : 0;
    
    console.log(`\n💾 数据挽救率: ${salvageRate}% (${this.stats.kept_azure + this.stats.reclassified}/${this.stats.total})`);
    console.log(`📉 删除率: ${(100 - salvageRate).toFixed(1)}% (${this.stats.deleted}/${this.stats.total})`);
    
    console.log('\n💡 处理结果:');
    console.log('   - ✅ 有效的 Azure OpenAI 密钥已保留');
    console.log('   - 🔄 错误分类的密钥已重新归类');
    console.log('   - 🗑️ 真正的假阳性已删除');
    console.log('   - 💾 最大程度保护了有效数据');
    
    console.log('='.repeat(80));
  }
}

// 运行重新处理器
async function main() {
  const reprocessor = new AzureOpenAIReprocessor();
  await reprocessor.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = AzureOpenAIReprocessor;