#!/usr/bin/env node

/**
 * Vertex AI 假阳性清理脚本
 * 删除已验证的假阳性 Vertex AI 密钥记录
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

class VertexAICleaner {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      processed: 0,
      deleted: 0,
      kept: 0,
      errors: 0,
      categories: {
        invalid_format: 0,
        insufficient_context: 0,
        hash_values: 0,
        comments: 0,
        excluded_context: 0,
        generic_strings: 0
      }
    };
  }

  async run() {
    console.log('🧹 开始清理 Vertex AI 假阳性密钥...\n');
    
    try {
      // 获取所有 Vertex AI 类型的密钥
      const { data: vertexKeys, error } = await this.supabase
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
        .eq('key_type', 'vertex_ai')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`查询失败: ${error.message}`);
      }

      this.stats.total = vertexKeys.length;
      console.log(`📊 找到 ${vertexKeys.length} 个 Vertex AI 密钥记录\n`);

      if (vertexKeys.length === 0) {
        console.log('✅ 没有需要清理的 Vertex AI 密钥');
        return;
      }

      // 逐个验证并清理密钥
      for (let i = 0; i < vertexKeys.length; i++) {
        const keyRecord = vertexKeys[i];
        console.log(`🔍 检查 ${i + 1}/${vertexKeys.length}: 密钥 ${keyRecord.id}`);
        
        const shouldDelete = this.shouldDeleteKey(keyRecord);
        
        if (shouldDelete.delete) {
          await this.deleteKeyRecord(keyRecord);
          this.stats.deleted++;
          this.stats.categories[shouldDelete.category]++;
          console.log(`  🗑️ 已删除: ${shouldDelete.reason}`);
        } else {
          this.stats.kept++;
          console.log(`  ✅ 保留: ${shouldDelete.reason}`);
        }
        
        this.stats.processed++;
        
        // 每处理20个记录显示一次进度
        if ((i + 1) % 20 === 0) {
          console.log(`📈 进度: ${i + 1}/${vertexKeys.length} (${Math.round((i + 1)/vertexKeys.length*100)}%)`);
        }
      }

      this.printSummary();

    } catch (error) {
      console.error('❌ 清理过程出错:', error.message);
    }
  }

  shouldDeleteKey(keyRecord) {
    const { leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    const fullKey = sensitiveRecord?.full_key;
    const rawContext = sensitiveRecord?.raw_context || '';
    
    if (!fullKey) {
      return {
        delete: true,
        reason: '缺少完整密钥数据',
        category: 'invalid_format'
      };
    }

    // 1. 检查密钥格式
    if (fullKey.length < 40) {
      return {
        delete: true,
        reason: `密钥长度太短 (${fullKey.length} < 40)`,
        category: 'invalid_format'
      };
    }

    if (fullKey.length > 200) {
      return {
        delete: true,
        reason: `密钥长度太长 (${fullKey.length} > 200)`,
        category: 'invalid_format'
      };
    }

    // 2. 检查是否在注释中
    if (this.isInComment(fullKey, rawContext)) {
      return {
        delete: true,
        reason: '密钥在代码注释中',
        category: 'comments'
      };
    }

    // 3. 检查上下文要求
    const contextValidation = this.validateContext(fullKey, rawContext);
    if (!contextValidation.isValid) {
      return {
        delete: true,
        reason: contextValidation.reason,
        category: 'insufficient_context'
      };
    }

    // 4. 检查是否为哈希值
    if (this.isHashValue(fullKey, rawContext)) {
      return {
        delete: true,
        reason: '疑似哈希值或Git commit',
        category: 'hash_values'
      };
    }

    // 5. 检查排除的上下文
    if (this.hasExcludedContext(fullKey, rawContext)) {
      return {
        delete: true,
        reason: '包含排除的上下文关键词',
        category: 'excluded_context'
      };
    }

    // 6. 检查通用字符串模式
    if (this.isGenericString(fullKey, rawContext)) {
      return {
        delete: true,
        reason: '疑似通用字符串或占位符',
        category: 'generic_strings'
      };
    }

    // 通过所有验证，保留此密钥
    return {
      delete: false,
      reason: '通过验证，疑似有效的 Vertex AI 密钥'
    };
  }

  validateContext(key, content) {
    const context = content.toLowerCase();
    
    // Vertex AI 必需关键词
    const requiredKeywords = ['vertex', 'google', 'gcp'];
    const matchingRequired = requiredKeywords.filter(keyword => 
      context.includes(keyword.toLowerCase())
    );

    if (matchingRequired.length === 0) {
      return {
        isValid: false,
        reason: '缺少必需的 Vertex AI 关键词 (vertex/google/gcp)'
      };
    }

    // 需要至少2个相关关键词
    const additionalKeywords = [
      'cloud', 'service-account', 'credentials', 'project', 
      'aiplatform', 'generative', 'ai', 'ml'
    ];
    
    const matchingAdditional = additionalKeywords.filter(keyword => 
      context.includes(keyword.toLowerCase())
    );

    const totalMatches = matchingRequired.length + matchingAdditional.length;
    
    if (totalMatches < 2) {
      return {
        isValid: false,
        reason: `Vertex AI 相关关键词不足 (${totalMatches}/2)`
      };
    }

    return { isValid: true };
  }

  isInComment(key, content) {
    const keyIndex = content.indexOf(key);
    if (keyIndex === -1) return false;

    const lines = content.split('\n');
    let currentPos = 0;
    
    for (const line of lines) {
      if (currentPos <= keyIndex && keyIndex < currentPos + line.length) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || 
            trimmedLine.startsWith('#') || 
            trimmedLine.startsWith('<!--') || 
            trimmedLine.includes('* ') ||
            trimmedLine.startsWith('*')) {
          return true;
        }
        break;
      }
      currentPos += line.length + 1;
    }
    
    return false;
  }

  isHashValue(key, content) {
    const context = content.toLowerCase();
    
    // 哈希值指示器
    const hashIndicators = [
      'commit', 'hash', 'sha', 'md5', 'sha256', 'sha512',
      'checksum', 'digest', 'git', 'github', 'gitlab',
      'version', 'build', 'tag'
    ];

    return hashIndicators.some(indicator => context.includes(indicator));
  }

  hasExcludedContext(key, content) {
    const context = content.toLowerCase();
    
    // 排除的关键词
    const excludeKeywords = [
      'example', 'test', 'demo', 'placeholder', 'sample',
      'mock', 'fake', 'dummy', 'template', 'xxx', 'yyy'
    ];

    return excludeKeywords.some(keyword => 
      context.includes(keyword) || key.toLowerCase().includes(keyword)
    );
  }

  isGenericString(key, content) {
    // 检查是否为UUID
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)) {
      return true;
    }

    // 检查是否包含重复字符模式
    if (/(.)\1{10,}/.test(key)) {
      return true;
    }

    // 检查是否为纯数字
    if (/^\d+$/.test(key)) {
      return true;
    }

    // 检查是否包含文件路径特征
    if (key.includes('/') && (key.includes('.') || key.includes('home') || key.includes('usr'))) {
      return true;
    }

    return false;
  }

  async deleteKeyRecord(keyRecord) {
    const { id, leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    
    try {
      // 首先删除可能的外键依赖记录
      const { error: accessLogsError } = await this.supabase
        .from('access_logs')
        .delete()
        .eq('key_id', id);

      // 忽略 access_logs 删除错误，因为可能没有相关记录
      
      // 删除敏感数据记录
      if (sensitiveRecord?.id) {
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .eq('id', sensitiveRecord.id);

        if (sensitiveError) {
          throw new Error(`删除敏感数据失败: ${sensitiveError.message}`);
        }
      }

      // 删除主记录
      const { error: mainError } = await this.supabase
        .from('leaked_keys')
        .delete()
        .eq('id', id);

      if (mainError) {
        throw new Error(`删除主记录失败: ${mainError.message}`);
      }

    } catch (error) {
      console.error(`  ❌ 删除记录 ${id} 时出错:`, error.message);
      this.stats.errors++;
      throw error;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Vertex AI 假阳性清理完成');
    console.log('='.repeat(80));
    console.log(`📈 总计处理: ${this.stats.total} 个密钥`);
    console.log(`🔄 已处理: ${this.stats.processed} 个`);
    console.log(`🗑️ 已删除: ${this.stats.deleted} 个`);
    console.log(`✅ 已保留: ${this.stats.kept} 个`);
    console.log(`❌ 处理错误: ${this.stats.errors} 个`);
    
    if (Object.keys(this.stats.categories).length > 0) {
      console.log('\n📋 删除原因统计:');
      Object.entries(this.stats.categories).forEach(([category, count]) => {
        if (count > 0) {
          const categoryNames = {
            invalid_format: '❌ 格式无效',
            insufficient_context: '📄 上下文不足',
            hash_values: '🔗 哈希值类型',
            comments: '📝 注释中的密钥',
            excluded_context: '🚫 排除的上下文',
            generic_strings: '🔤 通用字符串'
          };
          console.log(`   ${categoryNames[category] || category}: ${count} 个`);
        }
      });
    }
    
    const deletionRate = this.stats.total > 0 ? 
      ((this.stats.deleted / this.stats.total) * 100).toFixed(1) : 0;
    
    console.log(`\n📉 删除率: ${deletionRate}% (${this.stats.deleted}/${this.stats.total})`);
    console.log(`💾 保留率: ${(100 - deletionRate).toFixed(1)}% (${this.stats.kept}/${this.stats.total})`);
    
    console.log('\n💡 清理结果:');
    console.log('   - 🗑️ 删除了所有已验证的假阳性记录');
    console.log('   - ✅ 保留了可能有效的 Vertex AI 密钥');
    console.log('   - 🎯 大幅降低了假阳性率');
    
    if (this.stats.kept > 0) {
      console.log(`\n⚠️ 注意: 保留了 ${this.stats.kept} 个密钥，建议人工审核`);
    }
    
    console.log('='.repeat(80));
  }
}

// 运行清理器
async function main() {
  console.log('⚠️ 这将删除已验证的假阳性 Vertex AI 密钥记录');
  console.log('📋 建议先运行 npm run analyze:vertex 查看分析报告\n');
  
  const cleaner = new VertexAICleaner();
  await cleaner.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = VertexAICleaner;