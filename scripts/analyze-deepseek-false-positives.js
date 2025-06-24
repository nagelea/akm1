#!/usr/bin/env node

/**
 * DEEPSEEK 假阳性分析脚本
 * 分析数据库中的 DEEPSEEK 密钥，找出误识别的 OpenAI 密钥片段
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

class DeepSeekFalsePositiveAnalyzer {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      valid: 0,
      falsePositives: 0,
      categories: {
        openaiProject: 0,    // sk-proj-xxx
        openaiService: 0,    // sk-svcacct-xxx  
        openaiUser: 0,       // sk-user-xxx
        shortKeys: 0,        // 长度不足的密钥
        other: 0             // 其他类型假阳性
      }
    };
  }

  // 新的DEEPSEEK模式 (43-53字符)
  isValidDeepSeek(key) {
    const pattern = /^sk-[a-zA-Z0-9]{43,53}$/;
    return pattern.test(key);
  }

  // 检查是否为OpenAI相关前缀
  isOpenAIPrefix(key) {
    return key.startsWith('sk-proj-') || 
           key.startsWith('sk-user-') || 
           key.startsWith('sk-svcacct-');
  }

  // 分类假阳性类型
  categorizeFalsePositive(key) {
    if (key.startsWith('sk-proj-')) {
      return 'openaiProject';
    } else if (key.startsWith('sk-svcacct-')) {
      return 'openaiService';
    } else if (key.startsWith('sk-user-')) {
      return 'openaiUser';
    } else if (key.length < 46) { // sk- (3) + 43 = 46
      return 'shortKeys';
    } else {
      return 'other';
    }
  }

  async analyzeDeepSeekKeys() {
    try {
      console.log('🔍 正在分析数据库中的 DEEPSEEK 密钥...\n');

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

      const falsePositives = [];
      const validKeys = [];

      for (const keyRecord of deepseekKeys) {
        const sensitiveData = keyRecord.leaked_keys_sensitive?.[0];
        const fullKey = sensitiveData?.full_key;
        
        if (!fullKey) {
          console.log(`⚠️  跳过记录 ${keyRecord.id} - 缺少完整密钥`);
          continue;
        }

        const isValid = this.isValidDeepSeek(fullKey);
        const hasOpenAIPrefix = this.isOpenAIPrefix(fullKey);
        
        if (isValid && !hasOpenAIPrefix) {
          // 有效的DEEPSEEK密钥
          validKeys.push({
            id: keyRecord.id,
            key: fullKey,
            preview: keyRecord.key_preview,
            length: fullKey.length,
            context: sensitiveData?.raw_context || ''
          });
          this.stats.valid++;
        } else {
          // 假阳性
          const category = this.categorizeFalsePositive(fullKey);
          this.stats.categories[category]++;
          this.stats.falsePositives++;
          
          falsePositives.push({
            id: keyRecord.id,
            key: fullKey,
            preview: keyRecord.key_preview,
            length: fullKey.length,
            category,
            reason: this.getFalsePositiveReason(fullKey),
            context: sensitiveData?.raw_context || '',
            created_at: keyRecord.created_at
          });
        }
      }

      // 生成报告
      await this.generateReport(validKeys, falsePositives);
      this.printSummary();

    } catch (error) {
      console.error('❌ 分析失败:', error);
      process.exit(1);
    }
  }

  getFalsePositiveReason(key) {
    if (key.startsWith('sk-proj-')) {
      return `OpenAI Project密钥前缀，长度${key.length}字符`;
    } else if (key.startsWith('sk-svcacct-')) {
      return `OpenAI Service密钥前缀，长度${key.length}字符`;
    } else if (key.startsWith('sk-user-')) {
      return `OpenAI User密钥前缀，长度${key.length}字符`;
    } else if (key.length < 46) {
      return `密钥过短，长度${key.length}字符（应为46-56字符）`;
    } else {
      return `其他原因，长度${key.length}字符`;
    }
  }

  async generateReport(validKeys, falsePositives) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.stats.total,
        valid: this.stats.valid,
        falsePositives: this.stats.falsePositives,
        falsePositiveRate: ((this.stats.falsePositives / this.stats.total) * 100).toFixed(2) + '%'
      },
      categories: this.stats.categories,
      validKeys: validKeys.map(k => ({
        id: k.id,
        preview: k.preview,
        length: k.length,
        contextSnippet: k.context.substring(0, 100)
      })),
      falsePositives: falsePositives.map(fp => ({
        id: fp.id,
        preview: fp.preview,
        length: fp.length,
        category: fp.category,
        reason: fp.reason,
        contextSnippet: fp.context.substring(0, 100),
        created_at: fp.created_at
      }))
    };

    // 保存详细报告
    const reportPath = path.join(__dirname, '..', 'deepseek-analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 详细报告已保存: ${reportPath}\n`);

    // 保存假阳性ID列表（用于清理）
    if (falsePositives.length > 0) {
      const cleanupData = {
        timestamp: new Date().toISOString(),
        falsePositiveIds: falsePositives.map(fp => fp.id),
        totalCount: falsePositives.length,
        categories: this.stats.categories
      };
      
      const cleanupPath = path.join(__dirname, '..', 'deepseek-cleanup-ids.json');
      fs.writeFileSync(cleanupPath, JSON.stringify(cleanupData, null, 2));
      console.log(`🧹 清理ID列表已保存: ${cleanupPath}\n`);
    }
  }

  printSummary() {
    console.log('📈 === DEEPSEEK 假阳性分析结果 ===');
    console.log(`总记录数: ${this.stats.total}`);
    console.log(`有效密钥: ${this.stats.valid} (${((this.stats.valid / this.stats.total) * 100).toFixed(1)}%)`);
    console.log(`假阳性: ${this.stats.falsePositives} (${((this.stats.falsePositives / this.stats.total) * 100).toFixed(1)}%)`);
    
    console.log('\n📊 假阳性分类:');
    console.log(`  OpenAI Project (sk-proj-): ${this.stats.categories.openaiProject}`);
    console.log(`  OpenAI Service (sk-svcacct-): ${this.stats.categories.openaiService}`);
    console.log(`  OpenAI User (sk-user-): ${this.stats.categories.openaiUser}`);
    console.log(`  过短密钥: ${this.stats.categories.shortKeys}`);
    console.log(`  其他类型: ${this.stats.categories.other}`);

    if (this.stats.falsePositives > 0) {
      console.log('\n🔧 下一步:');
      console.log('1. 运行 npm run cleanup:deepseek 清理假阳性记录');
      console.log('2. 重新运行扫描以使用新的DEEPSEEK模式');
    }
  }
}

async function main() {
  const analyzer = new DeepSeekFalsePositiveAnalyzer();
  await analyzer.analyzeDeepSeekKeys();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeepSeekFalsePositiveAnalyzer;