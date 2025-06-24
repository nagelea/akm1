#!/usr/bin/env node

/**
 * Azure OpenAI 数据库清理脚本
 * 重新验证现有的 Azure OpenAI 密钥，移除假阳性记录
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

class AzureOpenAIValidator {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.processedCount = 0;
    this.removedCount = 0;
    this.validCount = 0;
    this.stats = {
      total: 0,
      validKeys: 0,
      falsePositives: 0,
      commentKeys: 0,
      hashLikeKeys: 0,
      insufficientContext: 0
    };
  }

  async run() {
    console.log('🔍 开始验证Azure OpenAI密钥...\n');
    
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

      // 逐个验证密钥
      for (const keyRecord of azureKeys) {
        await this.validateKey(keyRecord);
        this.processedCount++;
        
        // 每处理10个记录显示一次进度
        if (this.processedCount % 10 === 0) {
          console.log(`📈 进度: ${this.processedCount}/${azureKeys.length} (${Math.round(this.processedCount/azureKeys.length*100)}%)`);
        }
      }

      this.printSummary();

    } catch (error) {
      console.error('❌ 验证过程出错:', error.message);
    }
  }

  async validateKey(keyRecord) {
    const { id, leaked_keys_sensitive } = keyRecord;
    const fullKey = leaked_keys_sensitive[0]?.full_key;
    const rawContext = leaked_keys_sensitive[0]?.raw_context || '';
    
    if (!fullKey) {
      console.log(`⚠️ 密钥 ${id} 没有完整密钥数据`);
      return;
    }

    console.log(`🔍 验证密钥 ${id}: ${this.maskKey(fullKey)}`);

    const validationResult = this.performStrictValidation(fullKey, rawContext, keyRecord);
    
    if (validationResult.isValid) {
      this.stats.validKeys++;
      this.validCount++;
      console.log(`  ✅ 有效密钥 - ${validationResult.reason}`);
    } else {
      this.stats.falsePositives++;
      
      // 根据失败原因更新统计
      switch (validationResult.reason) {
        case 'in_comment':
          this.stats.commentKeys++;
          break;
        case 'looks_like_hash':
          this.stats.hashLikeKeys++;
          break;
        case 'insufficient_context':
          this.stats.insufficientContext++;
          break;
      }

      console.log(`  ❌ 假阳性 - ${validationResult.reason}`);
      
      // 删除假阳性记录
      await this.removeKeyRecord(id, leaked_keys_sensitive[0]?.id, validationResult.reason);
    }
  }

  performStrictValidation(key, rawContext, keyRecord) {
    // 1. 检查密钥格式（32位十六进制）
    if (!/^[a-f0-9]{32}$/.test(key)) {
      return { isValid: false, reason: 'invalid_format' };
    }

    const context = rawContext.toLowerCase();
    
    // 2. 检查是否在注释中
    if (this.isInComment(key, rawContext)) {
      return { isValid: false, reason: 'in_comment' };
    }

    // 3. 检查是否看起来像哈希值
    if (this.looksLikeHash(key, context)) {
      return { isValid: false, reason: 'looks_like_hash' };
    }

    // 4. 检查上下文要求
    const hasAzure = context.includes('azure');
    const hasOpenai = context.includes('openai');
    
    if (!hasAzure || !hasOpenai) {
      return { isValid: false, reason: 'insufficient_context' };
    }

    // 5. 检查排除的上下文
    const excludeKeywords = ['github', 'git', 'commit', 'hash', 'sha', 'md5', 'token', 'uuid', 'id'];
    const hasExcluded = excludeKeywords.some(keyword => context.includes(keyword));
    
    if (hasExcluded) {
      return { isValid: false, reason: 'excluded_context' };
    }

    return { isValid: true, reason: 'valid_azure_openai_key' };
  }

  isInComment(key, content) {
    const keyIndex = content.indexOf(key);
    if (keyIndex === -1) return false;

    const lines = content.split('\n');
    let currentPos = 0;
    
    for (const line of lines) {
      if (currentPos <= keyIndex && keyIndex < currentPos + line.length) {
        const trimmedLine = line.trim();
        // 检查是否在单行注释中
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#') || 
            trimmedLine.startsWith('<!--') || trimmedLine.includes('* ')) {
          return true;
        }
        break;
      }
      currentPos += line.length + 1;
    }
    
    // 检查多行注释
    const beforeKey = content.substring(0, keyIndex);
    const afterKey = content.substring(keyIndex);
    
    const lastCommentStart = beforeKey.lastIndexOf('/*');
    const lastCommentEnd = beforeKey.lastIndexOf('*/');
    if (lastCommentStart > lastCommentEnd && afterKey.includes('*/')) {
      return true;
    }
    
    return false;
  }

  looksLikeHash(key, context) {
    const hashIndicators = [
      'commit', 'hash', 'sha', 'md5', 'checksum', 'digest',
      'git', 'github', 'gitlab', 'repository', 'version',
      'uuid', 'guid', 'identifier', 'token_id'
    ];
    
    return hashIndicators.some(indicator => context.includes(indicator));
  }

  async removeKeyRecord(keyId, sensitiveId, reason) {
    try {
      // 记录删除原因
      console.log(`  🗑️ 删除假阳性记录 ${keyId} (原因: ${reason})`);

      // 删除敏感数据记录
      if (sensitiveId) {
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .eq('id', sensitiveId);

        if (sensitiveError) {
          console.error(`    ❌ 删除敏感数据失败: ${sensitiveError.message}`);
          return false;
        }
      }

      // 删除主记录
      const { error: mainError } = await this.supabase
        .from('leaked_keys')
        .delete()
        .eq('id', keyId);

      if (mainError) {
        console.error(`    ❌ 删除主记录失败: ${mainError.message}`);
        return false;
      }

      this.removedCount++;
      console.log(`    ✅ 已删除记录 ${keyId}`);
      return true;

    } catch (error) {
      console.error(`    ❌ 删除记录时出错: ${error.message}`);
      return false;
    }
  }

  maskKey(key) {
    if (!key || key.length < 8) return key;
    return key.substring(0, 4) + '*'.repeat(Math.max(0, key.length - 8)) + key.substring(key.length - 4);
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Azure OpenAI 密钥验证完成');
    console.log('='.repeat(60));
    console.log(`📈 总计处理: ${this.stats.total} 个密钥`);
    console.log(`✅ 有效密钥: ${this.stats.validKeys} 个`);
    console.log(`❌ 假阳性: ${this.stats.falsePositives} 个`);
    console.log(`🗑️ 已删除: ${this.removedCount} 个`);
    
    console.log('\n📋 假阳性分类:');
    console.log(`   📝 注释中的密钥: ${this.stats.commentKeys} 个`);
    console.log(`   🔗 哈希值类型: ${this.stats.hashLikeKeys} 个`);
    console.log(`   📄 上下文不足: ${this.stats.insufficientContext} 个`);
    
    const accuracy = this.stats.total > 0 ? 
      ((this.stats.validKeys / this.stats.total) * 100).toFixed(1) : 0;
    
    console.log(`\n🎯 准确率: ${accuracy}% (${this.stats.validKeys}/${this.stats.total})`);
    
    if (this.stats.falsePositives > 0) {
      const reduction = ((this.stats.falsePositives / this.stats.total) * 100).toFixed(1);
      console.log(`📉 假阳性减少: ${reduction}% (${this.stats.falsePositives}/${this.stats.total})`);
    }
    
    console.log('='.repeat(60));
  }
}

// 运行验证器
async function main() {
  const validator = new AzureOpenAIValidator();
  await validator.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = AzureOpenAIValidator;