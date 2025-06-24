#!/usr/bin/env node

/**
 * OpenAI 假阳性分析脚本
 * 分析数据库中的 OpenAI 密钥，找出可能的 CSS 类名误匹配
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

class OpenAIFalsePositiveAnalyzer {
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
        css_classes: 0,
        html_ids: 0,
        short_keys: 0,
        invalid_format: 0,
        comments: 0
      },
      examples: {
        css_classes: [],
        html_ids: [],
        short_keys: [],
        invalid_format: []
      }
    };
  }

  async run() {
    console.log('🔍 开始分析 OpenAI 密钥假阳性...\n');
    
    try {
      // 获取所有 OpenAI 相关密钥
      const openaiTypes = ['openai', 'openai_project', 'openai_user', 'openai_service'];
      
      for (const keyType of openaiTypes) {
        console.log(`📋 分析 ${keyType} 类型...`);
        
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
            created_at,
            leaked_keys_sensitive!inner(
              id,
              full_key,
              raw_context,
              github_url
            )
          `)
          .eq('key_type', keyType)
          .order('created_at', { ascending: false })
          .limit(50); // 分析最近的50个

        if (error) {
          throw new Error(`查询 ${keyType} 失败: ${error.message}`);
        }

        console.log(`  📊 找到 ${keys.length} 个 ${keyType} 密钥`);
        this.stats.total += keys.length;

        // 分析每个密钥
        keys.forEach(keyRecord => {
          this.analyzeKey(keyRecord, keyType);
        });
      }

      this.printReport();

    } catch (error) {
      console.error('❌ 分析过程出错:', error.message);
    }
  }

  analyzeKey(keyRecord, keyType) {
    const { leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    const fullKey = sensitiveRecord?.full_key;
    const rawContext = sensitiveRecord?.raw_context || '';
    
    if (!fullKey) {
      return;
    }

    // 1. 检查是否为 CSS 类名模式
    if (this.isCSSClass(fullKey)) {
      this.stats.falsePositives++;
      this.stats.categories.css_classes++;
      if (this.stats.examples.css_classes.length < 10) {
        this.stats.examples.css_classes.push({
          key: fullKey,
          preview: keyRecord.key_preview,
          repo: keyRecord.repo_name,
          file: keyRecord.file_path,
          type: keyType
        });
      }
      return;
    }

    // 2. 检查是否为 HTML ID 模式  
    if (this.isHTMLId(fullKey)) {
      this.stats.falsePositives++;
      this.stats.categories.html_ids++;
      if (this.stats.examples.html_ids.length < 10) {
        this.stats.examples.html_ids.push({
          key: fullKey,
          preview: keyRecord.key_preview,
          repo: keyRecord.repo_name,
          file: keyRecord.file_path,
          type: keyType
        });
      }
      return;
    }

    // 3. 检查是否过短
    if (this.isTooShort(fullKey)) {
      this.stats.falsePositives++;
      this.stats.categories.short_keys++;
      if (this.stats.examples.short_keys.length < 10) {
        this.stats.examples.short_keys.push({
          key: fullKey,
          preview: keyRecord.key_preview,
          repo: keyRecord.repo_name,
          file: keyRecord.file_path,
          type: keyType,
          length: fullKey.length
        });
      }
      return;
    }

    // 4. 检查是否在注释中
    if (this.isInComment(fullKey, rawContext)) {
      this.stats.falsePositives++;
      this.stats.categories.comments++;
      return;
    }

    // 5. 检查格式是否有效
    if (!this.isValidFormat(fullKey)) {
      this.stats.falsePositives++;
      this.stats.categories.invalid_format++;
      if (this.stats.examples.invalid_format.length < 10) {
        this.stats.examples.invalid_format.push({
          key: fullKey,
          preview: keyRecord.key_preview,
          repo: keyRecord.repo_name,
          file: keyRecord.file_path,
          type: keyType
        });
      }
      return;
    }

    // 通过所有检查，认为是有效密钥
    this.stats.valid++;
  }

  isCSSClass(key) {
    // 检查常见的 CSS 类名模式
    const cssPatterns = [
      /^sk-(main|input|wrapper|container|field|button|form|nav|header|footer|sidebar)/,
      /^sk-[a-zA-Z]+-[a-zA-Z]+$/,  // sk-word-word 格式
      /^sk-[a-zA-Z]+-(active|passive|primary|secondary|disabled|enabled)$/
    ];
    
    return cssPatterns.some(pattern => pattern.test(key));
  }

  isHTMLId(key) {
    // 检查常见的 HTML ID 模式
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
    console.log('📊 OpenAI 密钥假阳性分析报告');
    console.log('='.repeat(80));
    console.log(`📈 总计分析: ${this.stats.total} 个密钥`);
    console.log(`✅ 有效密钥: ${this.stats.valid} 个 (${(this.stats.valid/this.stats.total*100).toFixed(1)}%)`);
    console.log(`❌ 假阳性: ${this.stats.falsePositives} 个 (${(this.stats.falsePositives/this.stats.total*100).toFixed(1)}%)`);
    
    console.log('\n📋 假阳性分类:');
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

    // 显示示例
    console.log('\n🔍 假阳性示例:');
    
    if (this.stats.examples.css_classes.length > 0) {
      console.log('\n🎨 CSS 类名示例:');
      this.stats.examples.css_classes.slice(0, 5).forEach((example, i) => {
        console.log(`   ${i+1}. ${example.key} (${example.type})`);
        console.log(`      仓库: ${example.repo}`);
        console.log(`      文件: ${example.file}`);
      });
    }

    if (this.stats.examples.short_keys.length > 0) {
      console.log('\n📏 过短密钥示例:');
      this.stats.examples.short_keys.slice(0, 5).forEach((example, i) => {
        console.log(`   ${i+1}. ${example.key} (长度: ${example.length}, 类型: ${example.type})`);
        console.log(`      仓库: ${example.repo}`);
      });
    }

    const falsePositiveRate = this.stats.total > 0 ? 
      (this.stats.falsePositives / this.stats.total * 100).toFixed(1) : 0;
    
    console.log('\n💡 建议:');
    if (falsePositiveRate > 30) {
      console.log('   - 假阳性率较高，建议运行清理脚本');
      console.log('   - 考虑加强 OpenAI 密钥检测的长度和格式要求');
    } else if (falsePositiveRate > 10) {
      console.log('   - 存在一定假阳性，建议优化检测逻辑');
    } else {
      console.log('   - 假阳性率较低，检测逻辑相对准确');
    }
    
    console.log('='.repeat(80));
  }
}

// 运行分析器
async function main() {
  const analyzer = new OpenAIFalsePositiveAnalyzer();
  await analyzer.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = OpenAIFalsePositiveAnalyzer;