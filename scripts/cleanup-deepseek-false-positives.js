#!/usr/bin/env node

/**
 * DEEPSEEK 假阳性清理脚本
 * 基于分析结果清理数据库中误识别为DEEPSEEK的OpenAI密钥片段
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

class DeepSeekFalsePositiveCleanup {
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
      skipped: 0
    };

    this.dryRun = process.argv.includes('--dry-run');
    this.force = process.argv.includes('--force');
  }

  async loadCleanupData() {
    const cleanupPath = path.join(__dirname, '..', 'deepseek-cleanup-ids.json');
    
    if (!fs.existsSync(cleanupPath)) {
      console.log('❌ 清理数据文件不存在。请先运行分析脚本:');
      console.log('   npm run analyze:deepseek');
      process.exit(1);
    }

    try {
      const data = JSON.parse(fs.readFileSync(cleanupPath, 'utf8'));
      console.log(`📄 加载清理数据: ${data.totalCount} 个假阳性记录`);
      console.log(`📅 数据生成时间: ${data.timestamp}`);
      
      console.log('\n📊 假阳性分类:');
      Object.entries(data.categories).forEach(([category, count]) => {
        if (count > 0) {
          console.log(`  ${this.getCategoryName(category)}: ${count}`);
        }
      });
      
      return data.falsePositiveIds;
    } catch (error) {
      console.error('❌ 无法加载清理数据:', error);
      process.exit(1);
    }
  }

  getCategoryName(category) {
    const names = {
      openaiProject: 'OpenAI Project (sk-proj-)',
      openaiService: 'OpenAI Service (sk-svcacct-)',
      openaiUser: 'OpenAI User (sk-user-)',
      shortKeys: '过短密钥',
      other: '其他类型'
    };
    return names[category] || category;
  }

  async confirmCleanup(idsToDelete) {
    if (this.force) {
      return true;
    }

    console.log(`\n⚠️  准备删除 ${idsToDelete.length} 个DEEPSEEK假阳性记录`);
    
    if (this.dryRun) {
      console.log('🔍 DRY RUN 模式 - 不会实际删除数据');
      return true;
    }

    // 在生产环境中，这里可以添加用户确认逻辑
    console.log('🚨 这将永久删除这些记录！');
    console.log('💡 建议先运行 --dry-run 预览要删除的记录');
    
    // 自动确认（在脚本环境中）
    return true;
  }

  async previewDeletion(idsToDelete) {
    console.log('\n🔍 预览要删除的记录 (前10个):');
    
    const { data: preview, error } = await this.supabase
      .from('leaked_keys')
      .select(`
        id,
        key_preview,
        key_type,
        created_at,
        leaked_keys_sensitive (
          full_key
        )
      `)
      .in('id', idsToDelete.slice(0, 10));

    if (error) {
      console.error('❌ 预览失败:', error);
      return;
    }

    preview.forEach((record, index) => {
      const fullKey = record.leaked_keys_sensitive?.[0]?.full_key || 'N/A';
      console.log(`${index + 1}. ID: ${record.id}`);
      console.log(`   密钥: ${fullKey.substring(0, 20)}...`);
      console.log(`   长度: ${fullKey.length}`);
      console.log(`   创建时间: ${record.created_at}`);
      console.log('');
    });

    if (idsToDelete.length > 10) {
      console.log(`... 还有 ${idsToDelete.length - 10} 个记录\n`);
    }
  }

  async cleanupFalsePositives() {
    try {
      console.log('🧹 开始 DEEPSEEK 假阳性清理...\n');

      const idsToDelete = await this.loadCleanupData();
      this.stats.total = idsToDelete.length;

      if (idsToDelete.length === 0) {
        console.log('✅ 没有需要清理的假阳性记录');
        return;
      }

      // 预览要删除的记录
      await this.previewDeletion(idsToDelete);

      // 确认清理
      const confirmed = await this.confirmCleanup(idsToDelete);
      if (!confirmed) {
        console.log('❌ 清理操作已取消');
        return;
      }

      if (this.dryRun) {
        console.log('🔍 DRY RUN 模式 - 模拟删除过程');
        this.stats.deleted = idsToDelete.length;
        this.stats.processed = idsToDelete.length;
      } else {
        // 批量删除
        await this.batchDelete(idsToDelete);
      }

      // 生成清理报告
      await this.generateCleanupReport(idsToDelete);
      this.printSummary();

    } catch (error) {
      console.error('❌ 清理失败:', error);
      process.exit(1);
    }
  }

  async batchDelete(idsToDelete) {
    const batchSize = 100;
    console.log(`\n🗑️  开始批量删除 (批次大小: ${batchSize})...\n`);

    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = idsToDelete.slice(i, i + batchSize);
      
      try {
        console.log(`📦 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(idsToDelete.length / batchSize)} (${batch.length} 个记录)`);

        // 首先删除访问日志
        const { error: accessLogsError } = await this.supabase
          .from('access_logs')
          .delete()
          .in('key_id', batch);

        if (accessLogsError) {
          console.log(`⚠️  删除访问日志失败 (批次 ${Math.floor(i / batchSize) + 1}):`, accessLogsError.message);
          // 继续执行，因为可能没有访问日志记录
        }

        // 然后删除敏感数据
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .in('key_id', batch);

        if (sensitiveError) {
          console.error(`❌ 删除敏感数据失败 (批次 ${Math.floor(i / batchSize) + 1}):`, sensitiveError);
          this.stats.errors += batch.length;
          continue;
        }

        // 最后删除主记录
        const { error: mainError } = await this.supabase
          .from('leaked_keys')
          .delete()
          .in('id', batch);

        if (mainError) {
          console.error(`❌ 删除主记录失败 (批次 ${Math.floor(i / batchSize) + 1}):`, mainError);
          this.stats.errors += batch.length;
          continue;
        }

        this.stats.deleted += batch.length;
        this.stats.processed += batch.length;
        
        console.log(`✅ 批次 ${Math.floor(i / batchSize) + 1} 完成 (删除 ${batch.length} 个记录)`);

        // 添加延迟避免压力过大
        if (i + batchSize < idsToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ 批次处理失败:`, error);
        this.stats.errors += batch.length;
      }
    }
  }

  async generateCleanupReport(idsToDelete) {
    const report = {
      timestamp: new Date().toISOString(),
      operation: this.dryRun ? 'dry_run' : 'cleanup',
      summary: {
        total: this.stats.total,
        processed: this.stats.processed,
        deleted: this.stats.deleted,
        errors: this.stats.errors,
        successRate: this.stats.total > 0 ? ((this.stats.deleted / this.stats.total) * 100).toFixed(2) + '%' : '0%'
      },
      deletedIds: this.dryRun ? [] : idsToDelete.slice(0, this.stats.deleted)
    };

    const reportPath = path.join(__dirname, '..', `deepseek-cleanup-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 清理报告已保存: ${reportPath}`);
  }

  printSummary() {
    console.log('\n📈 === DEEPSEEK 假阳性清理结果 ===');
    console.log(`模式: ${this.dryRun ? 'DRY RUN (模拟)' : '实际清理'}`);
    console.log(`总记录数: ${this.stats.total}`);
    console.log(`已处理: ${this.stats.processed}`);
    console.log(`已删除: ${this.stats.deleted}`);
    console.log(`错误数: ${this.stats.errors}`);
    
    if (this.stats.total > 0) {
      const successRate = ((this.stats.deleted / this.stats.total) * 100).toFixed(1);
      console.log(`成功率: ${successRate}%`);
    }

    if (!this.dryRun && this.stats.deleted > 0) {
      console.log('\n🔧 建议下一步:');
      console.log('1. 重新运行扫描以使用新的DEEPSEEK模式');
      console.log('2. 验证剩余的DEEPSEEK记录是否正确');
    }

    if (this.dryRun) {
      console.log('\n💡 要执行实际清理，请运行:');
      console.log('   npm run cleanup:deepseek');
    }
  }
}

async function main() {
  const cleanup = new DeepSeekFalsePositiveCleanup();
  await cleanup.cleanupFalsePositives();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeepSeekFalsePositiveCleanup;