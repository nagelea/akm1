#!/usr/bin/env node

/**
 * DEEPSEEK 密钥重新处理脚本
 * 重新分类被误识别为DEEPSEEK的OpenAI密钥，并更新其正确类型
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

class DeepSeekKeyReprocessor {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      processed: 0,
      reclassified: 0,
      deleted: 0,
      errors: 0,
      valid: 0
    };

    this.dryRun = process.argv.includes('--dry-run');
  }

  // 确定正确的密钥类型
  determineCorrectKeyType(key) {
    if (key.startsWith('sk-proj-')) {
      const afterPrefix = key.replace('sk-proj-', '');
      if (afterPrefix.length >= 40) {
        return 'openai_project';
      }
      return null; // 太短，应该删除
    } else if (key.startsWith('sk-svcacct-')) {
      const afterPrefix = key.replace('sk-svcacct-', '');
      if (afterPrefix.length >= 40) {
        return 'openai_service';
      }
      return null; // 太短，应该删除
    } else if (key.startsWith('sk-user-')) {
      const afterPrefix = key.replace('sk-user-', '');
      if (afterPrefix.length >= 40) {
        return 'openai_user';
      }
      return null; // 太短，应该删除
    } else if (key.startsWith('sk-') && key.length === 51) {
      // 标准OpenAI格式 (sk- + 48字符)
      return 'openai';
    } else if (key.length < 46) { // sk- + 43 minimum
      return null; // 太短，应该删除
    } else {
      // 可能是有效的DEEPSEEK密钥
      return 'deepseek';
    }
  }

  // 检查是否为有效的DEEPSEEK密钥
  isValidDeepSeek(key) {
    const pattern = /^sk-[a-zA-Z0-9]{43,53}$/;
    return pattern.test(key) && !this.isOpenAIPrefix(key);
  }

  isOpenAIPrefix(key) {
    return key.startsWith('sk-proj-') || 
           key.startsWith('sk-user-') || 
           key.startsWith('sk-svcacct-');
  }

  async reprocessDeepSeekKeys() {
    try {
      console.log('🔄 开始重新处理 DEEPSEEK 密钥...\n');

      // 获取所有DEEPSEEK密钥
      const { data: deepseekKeys, error } = await this.supabase
        .from('leaked_keys')
        .select(`
          id,
          key_type,
          key_preview,
          status,
          confidence,
          created_at,
          leaked_keys_sensitive (
            full_key,
            raw_context
          )
        `)
        .eq('key_type', 'deepseek')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      console.log(`📊 找到 ${deepseekKeys.length} 个 DEEPSEEK 密钥记录\n`);
      this.stats.total = deepseekKeys.length;

      const toReclassify = [];
      const toDelete = [];
      const validDeepSeek = [];

      for (const keyRecord of deepseekKeys) {
        const sensitiveData = keyRecord.leaked_keys_sensitive?.[0];
        const fullKey = sensitiveData?.full_key;
        
        if (!fullKey) {
          console.log(`⚠️  跳过记录 ${keyRecord.id} - 缺少完整密钥`);
          continue;
        }

        const correctType = this.determineCorrectKeyType(fullKey);
        
        if (correctType === null) {
          // 应该删除
          toDelete.push({
            id: keyRecord.id,
            key: fullKey,
            reason: `密钥过短或格式无效 (长度: ${fullKey.length})`
          });
        } else if (correctType === 'deepseek') {
          // 有效的DEEPSEEK密钥
          validDeepSeek.push({
            id: keyRecord.id,
            key: fullKey
          });
          this.stats.valid++;
        } else {
          // 需要重新分类
          toReclassify.push({
            id: keyRecord.id,
            key: fullKey,
            currentType: 'deepseek',
            newType: correctType,
            length: fullKey.length
          });
        }
      }

      console.log('📊 处理结果统计:');
      console.log(`  有效DEEPSEEK: ${validDeepSeek.length}`);
      console.log(`  需要重新分类: ${toReclassify.length}`);
      console.log(`  需要删除: ${toDelete.length}\n`);

      if (this.dryRun) {
        console.log('🔍 DRY RUN 模式 - 预览处理结果\n');
        await this.previewChanges(toReclassify, toDelete);
      } else {
        // 执行重新分类
        if (toReclassify.length > 0) {
          await this.reclassifyKeys(toReclassify);
        }

        // 执行删除
        if (toDelete.length > 0) {
          await this.deleteInvalidKeys(toDelete);
        }
      }

      // 生成报告
      await this.generateReport(validDeepSeek, toReclassify, toDelete);
      this.printSummary();

    } catch (error) {
      console.error('❌ 重新处理失败:', error);
      process.exit(1);
    }
  }

  async previewChanges(toReclassify, toDelete) {
    if (toReclassify.length > 0) {
      console.log('🔄 要重新分类的记录 (前5个):');
      toReclassify.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ID: ${item.id}`);
        console.log(`   密钥: ${item.key.substring(0, 20)}...`);
        console.log(`   当前类型: ${item.currentType} → 新类型: ${item.newType}`);
        console.log(`   长度: ${item.length}`);
        console.log('');
      });
      if (toReclassify.length > 5) {
        console.log(`... 还有 ${toReclassify.length - 5} 个记录\n`);
      }
    }

    if (toDelete.length > 0) {
      console.log('🗑️  要删除的记录 (前5个):');
      toDelete.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ID: ${item.id}`);
        console.log(`   密钥: ${item.key.substring(0, 20)}...`);
        console.log(`   原因: ${item.reason}`);
        console.log('');
      });
      if (toDelete.length > 5) {
        console.log(`... 还有 ${toDelete.length - 5} 个记录\n`);
      }
    }
  }

  async reclassifyKeys(toReclassify) {
    console.log(`🔄 重新分类 ${toReclassify.length} 个密钥...\n`);

    for (const item of toReclassify) {
      try {
        const { error } = await this.supabase
          .from('leaked_keys')
          .update({ 
            key_type: item.newType,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (error) {
          console.error(`❌ 重新分类失败 ID ${item.id}:`, error);
          this.stats.errors++;
        } else {
          console.log(`✅ ID ${item.id}: deepseek → ${item.newType}`);
          this.stats.reclassified++;
        }

        this.stats.processed++;

      } catch (error) {
        console.error(`❌ 处理失败 ID ${item.id}:`, error);
        this.stats.errors++;
      }
    }
  }

  async deleteInvalidKeys(toDelete) {
    console.log(`\n🗑️  删除 ${toDelete.length} 个无效密钥...\n`);

    for (const item of toDelete) {
      try {
        // 先删除访问日志
        const { error: accessLogsError } = await this.supabase
          .from('access_logs')
          .delete()
          .eq('key_id', item.id);

        if (accessLogsError) {
          console.log(`⚠️  删除访问日志失败 ID ${item.id}:`, accessLogsError.message);
          // 继续执行，因为可能没有访问日志记录
        }

        // 然后删除敏感数据
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .eq('key_id', item.id);

        if (sensitiveError) {
          console.error(`❌ 删除敏感数据失败 ID ${item.id}:`, sensitiveError);
          this.stats.errors++;
          continue;
        }

        // 最后删除主记录
        const { error: mainError } = await this.supabase
          .from('leaked_keys')
          .delete()
          .eq('id', item.id);

        if (mainError) {
          console.error(`❌ 删除主记录失败 ID ${item.id}:`, mainError);
          this.stats.errors++;
        } else {
          console.log(`🗑️  删除 ID ${item.id}: ${item.reason}`);
          this.stats.deleted++;
        }

      } catch (error) {
        console.error(`❌ 删除失败 ID ${item.id}:`, error);
        this.stats.errors++;
      }
    }
  }

  async generateReport(validDeepSeek, toReclassify, toDelete) {
    const report = {
      timestamp: new Date().toISOString(),
      operation: this.dryRun ? 'dry_run' : 'reprocess',
      summary: {
        total: this.stats.total,
        valid: this.stats.valid,
        reclassified: this.stats.reclassified,
        deleted: this.stats.deleted,
        errors: this.stats.errors
      },
      validDeepSeekKeys: validDeepSeek.length,
      reclassifications: toReclassify.map(item => ({
        id: item.id,
        from: item.currentType,
        to: item.newType,
        keyLength: item.length
      })),
      deletions: toDelete.map(item => ({
        id: item.id,
        reason: item.reason
      }))
    };

    const reportPath = path.join(__dirname, '..', `deepseek-reprocess-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 重新处理报告已保存: ${reportPath}`);
  }

  printSummary() {
    console.log('\n📈 === DEEPSEEK 密钥重新处理结果 ===');
    console.log(`模式: ${this.dryRun ? 'DRY RUN (模拟)' : '实际处理'}`);
    console.log(`总记录数: ${this.stats.total}`);
    console.log(`有效DEEPSEEK: ${this.stats.valid}`);
    console.log(`重新分类: ${this.stats.reclassified}`);
    console.log(`已删除: ${this.stats.deleted}`);
    console.log(`错误数: ${this.stats.errors}`);

    if (!this.dryRun && (this.stats.reclassified > 0 || this.stats.deleted > 0)) {
      console.log('\n🔧 建议下一步:');
      console.log('1. 验证重新分类的密钥是否正确');
      console.log('2. 重新运行扫描以使用新的DEEPSEEK模式');
    }

    if (this.dryRun) {
      console.log('\n💡 要执行实际重新处理，请运行:');
      console.log('   npm run reprocess:deepseek');
    }
  }
}

async function main() {
  const reprocessor = new DeepSeekKeyReprocessor();
  await reprocessor.reprocessDeepSeekKeys();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeepSeekKeyReprocessor;