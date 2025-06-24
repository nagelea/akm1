#!/usr/bin/env node

/**
 * OpenAI 假阳性清理脚本
 * 基于分析结果清理数据库中的 CSS 类名和其他假阳性匹配
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

class OpenAIFalsePositiveCleanup {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      processed: 0,
      deleted: 0,
      errors: 0,
      categories: {
        css_classes: 0,
        html_ids: 0,
        short_keys: 0,
        invalid_format: 0,
        comments: 0
      }
    };
  }

  async run() {
    console.log('🧹 开始清理 OpenAI 假阳性记录...\n');
    
    try {
      const openaiTypes = ['openai', 'openai_project', 'openai_user', 'openai_service'];
      
      for (const keyType of openaiTypes) {
        console.log(`📋 处理 ${keyType} 类型...`);
        await this.processKeyType(keyType);
      }

      this.printReport();

    } catch (error) {
      console.error('❌ 清理过程出错:', error.message);
    }
  }

  async processKeyType(keyType) {
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
      const { data: keys, error } = await this.supabase
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
            raw_context
          )
        `)
        .eq('key_type', keyType)
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`查询 ${keyType} 失败: ${error.message}`);
      }

      if (keys.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`  📊 批次处理 ${keys.length} 个记录 (偏移: ${offset})`);
      this.stats.total += keys.length;

      for (const keyRecord of keys) {
        await this.processKey(keyRecord, keyType);
      }

      offset += batchSize;
      
      if (keys.length < batchSize) {
        hasMore = false;
      }
    }
  }

  async processKey(keyRecord, keyType) {
    const { leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    const fullKey = sensitiveRecord?.full_key;
    const rawContext = sensitiveRecord?.raw_context || '';
    
    if (!fullKey) {
      return;
    }

    this.stats.processed++;
    let shouldDelete = false;
    let category = '';

    // 1. 检查是否为 CSS 类名模式
    if (this.isCSSClass(fullKey)) {
      shouldDelete = true;
      category = 'css_classes';
    }
    // 2. 检查是否为 HTML ID 模式  
    else if (this.isHTMLId(fullKey)) {
      shouldDelete = true;
      category = 'html_ids';
    }
    // 3. 检查是否过短
    else if (this.isTooShort(fullKey)) {
      shouldDelete = true;
      category = 'short_keys';
    }
    // 4. 检查是否在注释中
    else if (this.isInComment(fullKey, rawContext)) {
      shouldDelete = true;
      category = 'comments';
    }
    // 5. 检查格式是否有效
    else if (!this.isValidFormat(fullKey)) {
      shouldDelete = true;
      category = 'invalid_format';
    }

    if (shouldDelete) {
      try {
        // 先删除关联的access_logs记录
        const { error: accessLogError } = await this.supabase
          .from('access_logs')
          .delete()
          .eq('key_id', keyRecord.id);

        if (accessLogError) {
          console.warn(`⚠️ 删除访问日志失败 (${fullKey}): ${accessLogError.message}`);
        }

        // 删除敏感数据记录
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .eq('id', sensitiveRecord.id);

        if (sensitiveError) {
          throw new Error(`删除敏感记录失败: ${sensitiveError.message}`);
        }

        // 最后删除主记录
        const { error: mainError } = await this.supabase
          .from('leaked_keys')
          .delete()
          .eq('id', keyRecord.id);

        if (mainError) {
          throw new Error(`删除主记录失败: ${mainError.message}`);
        }

        this.stats.deleted++;
        this.stats.categories[category]++;
        
        if (this.stats.deleted % 10 === 0) {
          console.log(`    ✓ 已删除 ${this.stats.deleted} 个假阳性记录`);
        }

      } catch (error) {
        console.error(`❌ 删除记录失败 (${fullKey}):`, error.message);
        this.stats.errors++;
      }
    }
  }

  isCSSClass(key) {
    const cssPatterns = [
      /^sk-(main|input|wrapper|container|field|button|form|nav|header|footer|sidebar)/,
      /^sk-[a-zA-Z]+-[a-zA-Z]+$/,  // sk-word-word 格式
      /^sk-[a-zA-Z]+-(active|passive|primary|secondary|disabled|enabled)$/
    ];
    
    return cssPatterns.some(pattern => pattern.test(key));
  }

  isHTMLId(key) {
    const htmlIdPatterns = [
      /^sk-[a-zA-Z]+-\d+$/,  // sk-element-123
      /^sk-(component|element|widget|control)-/
    ];
    
    return htmlIdPatterns.some(pattern => pattern.test(key));
  }

  isTooShort(key) {
    // OpenAI 密钥应该至少40个字符
    return key.length < 40;
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
            trimmedLine.includes('* ')) {
          return true;
        }
        break;
      }
      currentPos += line.length + 1;
    }
    
    return false;
  }

  isValidFormat(key) {
    // 检查是否符合 OpenAI API 密钥格式
    const validPatterns = [
      /^sk-[a-zA-Z0-9]{48}$/,  // 标准格式
      /^sk-proj-[a-zA-Z0-9]{40,}$/,  // 项目密钥
      /^sk-user-[a-zA-Z0-9]{40,}$/,  // 用户密钥
      /^sk-svcacct-[a-zA-Z0-9]{40,}$/  // 服务账号密钥
    ];
    
    return validPatterns.some(pattern => pattern.test(key));
  }

  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🧹 OpenAI 假阳性清理报告');
    console.log('='.repeat(80));
    console.log(`📈 总计处理: ${this.stats.total} 个记录`);
    console.log(`🔍 分析记录: ${this.stats.processed} 个`);
    console.log(`🗑️ 删除记录: ${this.stats.deleted} 个`);
    console.log(`❌ 错误记录: ${this.stats.errors} 个`);
    
    if (this.stats.processed > 0) {
      const deletionRate = (this.stats.deleted / this.stats.processed * 100).toFixed(1);
      console.log(`📊 删除率: ${deletionRate}%`);
    }
    
    console.log('\n📋 删除分类:');
    Object.entries(this.stats.categories).forEach(([category, count]) => {
      if (count > 0) {
        const categoryNames = {
          css_classes: '🎨 CSS 类名',
          html_ids: '🏷️ HTML ID',
          short_keys: '📏 过短密钥',
          invalid_format: '❌ 无效格式',
          comments: '📝 代码注释'
        };
        console.log(`   ${categoryNames[category] || category}: ${count} 个`);
      }
    });

    console.log('\n💡 清理结果:');
    if (this.stats.deleted > 0) {
      console.log(`   ✅ 成功清理 ${this.stats.deleted} 个假阳性记录`);
      console.log('   📈 数据库质量得到显著提升');
    } else {
      console.log('   ℹ️ 未发现需要清理的假阳性记录');
    }
    
    if (this.stats.errors > 0) {
      console.log(`   ⚠️ ${this.stats.errors} 个记录清理失败，请检查日志`);
    }
    
    console.log('='.repeat(80));
  }
}

// 运行清理器
async function main() {
  const cleanup = new OpenAIFalsePositiveCleanup();
  await cleanup.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = OpenAIFalsePositiveCleanup;