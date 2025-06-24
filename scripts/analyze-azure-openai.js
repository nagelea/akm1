#!/usr/bin/env node

/**
 * Azure OpenAI 数据分析脚本
 * 只分析不删除，生成详细报告
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

class AzureOpenAIAnalyzer {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.results = {
      total: 0,
      valid: [],
      falsePositives: [],
      categories: {
        in_comment: [],
        looks_like_hash: [],
        insufficient_context: [],
        excluded_context: [],
        invalid_format: []
      }
    };
  }

  async run() {
    console.log('🔍 开始分析Azure OpenAI密钥...\n');
    
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

      this.results.total = azureKeys.length;
      console.log(`📊 找到 ${azureKeys.length} 个 Azure OpenAI 密钥记录\n`);

      if (azureKeys.length === 0) {
        console.log('✅ 没有 Azure OpenAI 密钥记录');
        return;
      }

      // 分析每个密钥
      for (let i = 0; i < azureKeys.length; i++) {
        const keyRecord = azureKeys[i];
        console.log(`🔍 分析 ${i + 1}/${azureKeys.length}: 密钥 ${keyRecord.id}`);
        
        await this.analyzeKey(keyRecord);
      }

      this.generateReport();
      await this.saveReport();

    } catch (error) {
      console.error('❌ 分析过程出错:', error.message);
    }
  }

  async analyzeKey(keyRecord) {
    const { id, leaked_keys_sensitive, repo_name, file_path } = keyRecord;
    const fullKey = leaked_keys_sensitive[0]?.full_key;
    const rawContext = leaked_keys_sensitive[0]?.raw_context || '';
    const githubUrl = leaked_keys_sensitive[0]?.github_url;
    
    if (!fullKey) {
      console.log(`  ⚠️ 密钥 ${id} 没有完整密钥数据`);
      return;
    }

    const validationResult = this.performStrictValidation(fullKey, rawContext, keyRecord);
    
    const analysis = {
      id,
      key_preview: this.maskKey(fullKey),
      repo_name,
      file_path,
      github_url: githubUrl,
      validation: validationResult,
      context_snippet: this.getContextSnippet(fullKey, rawContext)
    };
    
    if (validationResult.isValid) {
      this.results.valid.push(analysis);
      console.log(`  ✅ 有效 - ${validationResult.reason}`);
    } else {
      this.results.falsePositives.push(analysis);
      this.results.categories[validationResult.reason].push(analysis);
      console.log(`  ❌ 假阳性 - ${validationResult.reason}`);
    }
  }

  performStrictValidation(key, rawContext, keyRecord) {
    // 1. 检查密钥格式（32位十六进制）
    if (!/^[a-f0-9]{32}$/.test(key)) {
      return { isValid: false, reason: 'invalid_format', details: '不是32位十六进制格式' };
    }

    const context = rawContext.toLowerCase();
    
    // 2. 检查是否在注释中
    if (this.isInComment(key, rawContext)) {
      return { isValid: false, reason: 'in_comment', details: '密钥在代码注释中' };
    }

    // 3. 检查是否看起来像哈希值
    if (this.looksLikeHash(key, context)) {
      return { isValid: false, reason: 'looks_like_hash', details: '上下文包含哈希相关关键词' };
    }

    // 4. 检查排除的上下文
    const excludeKeywords = ['github', 'git', 'commit', 'hash', 'sha', 'md5', 'token', 'uuid', 'id'];
    const foundExcluded = excludeKeywords.filter(keyword => context.includes(keyword));
    
    if (foundExcluded.length > 0) {
      return { isValid: false, reason: 'excluded_context', details: `包含排除关键词: ${foundExcluded.join(', ')}` };
    }

    // 5. 检查上下文要求
    const hasAzure = context.includes('azure');
    const hasOpenai = context.includes('openai');
    
    if (!hasAzure || !hasOpenai) {
      const missing = [];
      if (!hasAzure) missing.push('azure');
      if (!hasOpenai) missing.push('openai');
      return { isValid: false, reason: 'insufficient_context', details: `缺少关键词: ${missing.join(', ')}` };
    }

    return { isValid: true, reason: 'valid_azure_openai_key', details: '通过所有验证检查' };
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

  getContextSnippet(key, content) {
    const keyIndex = content.indexOf(key);
    if (keyIndex === -1) return '';
    
    const start = Math.max(0, keyIndex - 100);
    const end = Math.min(content.length, keyIndex + key.length + 100);
    const snippet = content.substring(start, end);
    
    // 替换密钥为掩码
    return snippet.replace(key, this.maskKey(key));
  }

  maskKey(key) {
    if (!key || key.length < 8) return key;
    return key.substring(0, 4) + '*'.repeat(Math.max(0, key.length - 8)) + key.substring(key.length - 4);
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Azure OpenAI 密钥分析报告');
    console.log('='.repeat(80));
    
    const validCount = this.results.valid.length;
    const falsePositiveCount = this.results.falsePositives.length;
    const accuracy = this.results.total > 0 ? ((validCount / this.results.total) * 100).toFixed(1) : 0;
    
    console.log(`📈 总计密钥: ${this.results.total}`);
    console.log(`✅ 有效密钥: ${validCount} (${accuracy}%)`);
    console.log(`❌ 假阳性: ${falsePositiveCount} (${(100 - accuracy).toFixed(1)}%)`);
    
    console.log('\n📋 假阳性分类:');
    Object.entries(this.results.categories).forEach(([category, items]) => {
      if (items.length > 0) {
        console.log(`   ${this.getCategoryIcon(category)} ${this.getCategoryName(category)}: ${items.length} 个`);
      }
    });
    
    console.log('\n🔍 假阳性示例:');
    this.results.falsePositives.slice(0, 5).forEach((item, index) => {
      console.log(`\n   ${index + 1}. 密钥 ${item.id} (${item.validation.reason})`);
      console.log(`      仓库: ${item.repo_name}`);
      console.log(`      文件: ${item.file_path}`);
      console.log(`      原因: ${item.validation.details}`);
      console.log(`      上下文: ${item.context_snippet.substring(0, 100)}...`);
    });
    
    if (this.results.falsePositives.length > 5) {
      console.log(`\n   ... 还有 ${this.results.falsePositives.length - 5} 个假阳性记录`);
    }
    
    console.log('\n✅ 有效密钥示例:');
    this.results.valid.slice(0, 3).forEach((item, index) => {
      console.log(`\n   ${index + 1}. 密钥 ${item.id}`);
      console.log(`      仓库: ${item.repo_name}`);
      console.log(`      文件: ${item.file_path}`);
      console.log(`      上下文: ${item.context_snippet.substring(0, 100)}...`);
    });
    
    console.log('\n💡 建议:');
    if (falsePositiveCount > validCount) {
      console.log('   - 假阳性率很高，建议执行清理脚本删除假阳性记录');
      console.log('   - 运行: node scripts/cleanup-azure-openai.js');
    } else {
      console.log('   - 假阳性率可接受，可考虑进一步优化验证规则');
    }
    
    console.log('='.repeat(80));
  }

  getCategoryIcon(category) {
    const icons = {
      in_comment: '📝',
      looks_like_hash: '🔗',
      insufficient_context: '📄',
      excluded_context: '🚫',
      invalid_format: '❌'
    };
    return icons[category] || '❓';
  }

  getCategoryName(category) {
    const names = {
      in_comment: '注释中的密钥',
      looks_like_hash: '哈希值类型',
      insufficient_context: '上下文不足',
      excluded_context: '排除的上下文',
      invalid_format: '格式无效'
    };
    return names[category] || category;
  }

  async saveReport() {
    const reportPath = path.join(__dirname, '..', 'azure-openai-analysis-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.total,
        valid: this.results.valid.length,
        falsePositives: this.results.falsePositives.length,
        accuracy: this.results.total > 0 ? (this.results.valid.length / this.results.total * 100).toFixed(1) : 0
      },
      categories: Object.fromEntries(
        Object.entries(this.results.categories).map(([key, items]) => [key, items.length])
      ),
      details: {
        valid: this.results.valid,
        falsePositives: this.results.falsePositives
      }
    };
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 详细报告已保存到: ${reportPath}`);
    } catch (error) {
      console.error(`❌ 保存报告失败: ${error.message}`);
    }
  }
}

// 运行分析器
async function main() {
  const analyzer = new AzureOpenAIAnalyzer();
  await analyzer.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = AzureOpenAIAnalyzer;