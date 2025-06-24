#!/usr/bin/env node

/**
 * Vertex AI 密钥分析脚本
 * 分析假阳性情况并生成详细报告
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

class VertexAIAnalyzer {
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
        hash_values: 0,
        comments: 0,
        insufficient_context: 0,
        excluded_context: 0,
        invalid_format: 0,
        generic_strings: 0,
        file_paths: 0,
        encoded_data: 0
      },
      validationResults: []
    };
  }

  async run() {
    console.log('🔍 开始分析 Vertex AI 密钥...\n');
    
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
        .order('created_at', { ascending: false })
        .limit(200); // 先分析前200个

      if (error) {
        throw new Error(`查询失败: ${error.message}`);
      }

      this.stats.total = vertexKeys.length;
      console.log(`📊 找到 ${vertexKeys.length} 个 Vertex AI 密钥记录 (分析前200个)\n`);

      if (vertexKeys.length === 0) {
        console.log('✅ 没有找到 Vertex AI 密钥');
        return;
      }

      // 逐个分析密钥
      for (let i = 0; i < vertexKeys.length; i++) {
        const keyRecord = vertexKeys[i];
        console.log(`🔍 分析 ${i + 1}/${vertexKeys.length}: 密钥 ${keyRecord.id}`);
        
        const result = this.analyzeKey(keyRecord);
        this.stats.validationResults.push({
          id: keyRecord.id,
          key_preview: keyRecord.key_preview,
          repo_name: keyRecord.repo_name,
          file_path: keyRecord.file_path,
          ...result
        });
        
        if (result.isValid) {
          this.stats.valid++;
          console.log(`  ✅ 有效的 Vertex AI 密钥`);
        } else {
          this.stats.falsePositives++;
          this.stats.categories[result.category]++;
          console.log(`  ❌ 假阳性: ${result.reason}`);
        }
        
        // 每处理20个记录显示一次进度
        if ((i + 1) % 20 === 0) {
          console.log(`📈 进度: ${i + 1}/${vertexKeys.length} (${Math.round((i + 1)/vertexKeys.length*100)}%)`);
        }
      }

      this.generateReport();
      this.printSummary();

    } catch (error) {
      console.error('❌ 分析过程出错:', error.message);
    }
  }

  analyzeKey(keyRecord) {
    const { leaked_keys_sensitive } = keyRecord;
    const sensitiveRecord = leaked_keys_sensitive[0];
    const fullKey = sensitiveRecord?.full_key;
    const rawContext = sensitiveRecord?.raw_context || '';
    const contextPreview = keyRecord.context_preview || '';
    
    if (!fullKey) {
      return {
        isValid: false,
        reason: '缺少完整密钥数据',
        category: 'insufficient_context',
        confidence: 0
      };
    }

    // 1. 检查密钥格式
    const formatValidation = this.validateFormat(fullKey);
    if (!formatValidation.isValid) {
      return {
        isValid: false,
        reason: formatValidation.reason,
        category: 'invalid_format',
        confidence: 0
      };
    }

    // 2. 检查是否在注释中
    if (this.isInComment(fullKey, rawContext)) {
      return {
        isValid: false,
        reason: '密钥在代码注释中',
        category: 'comments',
        confidence: 0
      };
    }

    // 3. 检查上下文要求
    const contextValidation = this.validateContext(fullKey, rawContext);
    if (!contextValidation.isValid) {
      return {
        isValid: false,
        reason: contextValidation.reason,
        category: contextValidation.category,
        confidence: contextValidation.confidence
      };
    }

    // 4. 检查是否为常见假阳性模式
    const falsePositiveCheck = this.checkFalsePositivePatterns(fullKey, rawContext);
    if (!falsePositiveCheck.isValid) {
      return {
        isValid: false,
        reason: falsePositiveCheck.reason,
        category: falsePositiveCheck.category,
        confidence: 0
      };
    }

    // 5. 严格的 Vertex AI 特征验证
    const vertexValidation = this.performStrictVertexValidation(fullKey, rawContext, keyRecord);
    
    return {
      isValid: vertexValidation.isValid,
      reason: vertexValidation.reason,
      category: vertexValidation.isValid ? 'valid' : vertexValidation.category,
      confidence: vertexValidation.confidence,
      details: vertexValidation.details
    };
  }

  validateFormat(key) {
    // Vertex AI 服务账号密钥通常是较长的字符串
    if (key.length < 40) {
      return { isValid: false, reason: `密钥长度太短 (${key.length} < 40)` };
    }

    if (key.length > 200) {
      return { isValid: false, reason: `密钥长度太长 (${key.length} > 200)，可能是编码数据` };
    }

    // 检查是否为纯数字（通常不是 API 密钥）
    if (/^\d+$/.test(key)) {
      return { isValid: false, reason: '纯数字字符串，可能是 ID 或时间戳' };
    }

    // 检查是否为文件路径
    if (key.includes('/') && (key.includes('.') || key.includes('home') || key.includes('usr'))) {
      return { isValid: false, reason: '包含文件路径特征' };
    }

    // 检查是否为 Base64 编码但太短
    if (/^[A-Za-z0-9+/]+=*$/.test(key) && key.length < 50) {
      return { isValid: false, reason: 'Base64 格式但长度不足，可能是其他编码数据' };
    }

    return { isValid: true };
  }

  validateContext(key, content) {
    const keyIndex = content.indexOf(key);
    if (keyIndex === -1) {
      return { isValid: false, reason: '在上下文中找不到密钥', category: 'insufficient_context', confidence: 0 };
    }

    // 获取密钥周围的上下文
    const contextStart = Math.max(0, keyIndex - 300);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 300);
    const context = content.substring(contextStart, contextEnd).toLowerCase();

    // Vertex AI 相关关键词
    const vertexKeywords = [
      'vertex', 'vertexai', 'vertex-ai', 'vertex_ai',
      'google', 'gcp', 'cloud', 'service-account', 
      'credentials', 'serviceaccount', 'project',
      'aiplatform', 'generativeai'
    ];

    // 计算匹配的关键词
    const matchingKeywords = vertexKeywords.filter(keyword => 
      context.includes(keyword.toLowerCase())
    );

    if (matchingKeywords.length === 0) {
      return { 
        isValid: false, 
        reason: '上下文中缺少 Vertex AI 相关关键词', 
        category: 'insufficient_context',
        confidence: 0 
      };
    }

    // 需要至少2个相关关键词才有较高置信度
    if (matchingKeywords.length < 2) {
      return { 
        isValid: false, 
        reason: `Vertex AI 关键词不足 (${matchingKeywords.length}/2)`, 
        category: 'insufficient_context',
        confidence: matchingKeywords.length * 20 
      };
    }

    return { 
      isValid: true, 
      confidence: Math.min(100, matchingKeywords.length * 25),
      matchingKeywords 
    };
  }

  checkFalsePositivePatterns(key, content) {
    const context = content.toLowerCase();

    // 哈希值指示器
    const hashIndicators = [
      'commit', 'hash', 'sha', 'md5', 'sha256', 'sha512',
      'checksum', 'digest', 'git', 'github', 'gitlab',
      'version', 'build', 'tag'
    ];

    for (const indicator of hashIndicators) {
      if (context.includes(indicator)) {
        return {
          isValid: false,
          reason: `包含哈希值指示器: ${indicator}`,
          category: 'hash_values'
        };
      }
    }

    // UUID/GUID 模式
    if (/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(key)) {
      return {
        isValid: false,
        reason: 'UUID/GUID 格式',
        category: 'generic_strings'
      };
    }

    // 重复字符模式（通常是占位符）
    if (/(.)\1{10,}/.test(key)) {
      return {
        isValid: false,
        reason: '包含大量重复字符，可能是占位符',
        category: 'generic_strings'
      };
    }

    // 编码数据指示器
    const encodingIndicators = [
      'base64', 'encoded', 'decode', 'encode', 'jwt', 'token_id',
      'session', 'csrf', 'xsrf', 'nonce', 'timestamp'
    ];

    for (const indicator of encodingIndicators) {
      if (context.includes(indicator)) {
        return {
          isValid: false,
          reason: `包含编码数据指示器: ${indicator}`,
          category: 'encoded_data'
        };
      }
    }

    return { isValid: true };
  }

  performStrictVertexValidation(key, rawContext, keyRecord) {
    const context = rawContext.toLowerCase();
    
    // 1. 强制要求包含 Google/Vertex 相关内容
    const requiredKeywords = ['google', 'vertex', 'gcp', 'cloud'];
    const hasRequired = requiredKeywords.some(keyword => context.includes(keyword));
    
    if (!hasRequired) {
      return {
        isValid: false,
        reason: '缺少必需的 Google/Vertex 关键词',
        category: 'insufficient_context',
        confidence: 0,
        details: '必须包含 google, vertex, gcp, 或 cloud 关键词之一'
      };
    }

    // 2. 检查服务账号特征
    const serviceAccountIndicators = [
      'service-account', 'serviceaccount', 'credentials', 'service_account',
      'client_email', 'private_key', 'project_id', 'auth_uri'
    ];
    
    const hasServiceAccount = serviceAccountIndicators.some(indicator => 
      context.includes(indicator)
    );

    // 3. 检查 AI/ML 相关特征
    const aiIndicators = [
      'ai', 'ml', 'model', 'predict', 'endpoint', 'aiplatform',
      'generative', 'palm', 'bison', 'gemini', 'vertex'
    ];
    
    const hasAIFeatures = aiIndicators.some(indicator => 
      context.includes(indicator)
    );

    // 4. 排除明显的非 API 密钥内容
    const excludePatterns = [
      'example', 'test', 'demo', 'placeholder', 'xxx', 'yyy',
      'sample', 'mock', 'fake', 'dummy', 'template'
    ];
    
    const hasExcluded = excludePatterns.some(pattern => 
      context.includes(pattern) || key.toLowerCase().includes(pattern)
    );

    if (hasExcluded) {
      return {
        isValid: false,
        reason: '包含示例/测试相关关键词',
        category: 'generic_strings',
        confidence: 0,
        details: '包含 example, test, demo 等示例关键词'
      };
    }

    // 5. 检查文件类型
    const filePath = keyRecord.file_path || '';
    const suspiciousFiles = [
      '.md', '.txt', '.log', '.json', '.xml', '.html',
      'readme', 'doc', 'example', 'test', 'spec'
    ];
    
    const isSuspiciousFile = suspiciousFiles.some(pattern => 
      filePath.toLowerCase().includes(pattern)
    );

    // 6. 计算置信度评分
    let confidence = 0;
    
    if (hasRequired) confidence += 30;
    if (hasServiceAccount) confidence += 40;
    if (hasAIFeatures) confidence += 30;
    
    // 减分项
    if (isSuspiciousFile) confidence -= 20;
    if (key.length < 50) confidence -= 10;
    if (key.length > 150) confidence -= 10;

    // 最终验证：需要同时满足多个条件
    const isValid = confidence >= 60 && hasRequired && (hasServiceAccount || hasAIFeatures);

    return {
      isValid,
      reason: isValid ? '通过严格验证' : `置信度不足 (${confidence}/100)`,
      category: isValid ? 'valid' : 'insufficient_context',
      confidence,
      details: {
        hasRequired,
        hasServiceAccount,
        hasAIFeatures,
        isSuspiciousFile,
        keyLength: key.length
      }
    };
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

  generateReport() {
    const report = {
      analysis_date: new Date().toISOString(),
      total_keys: this.stats.total,
      valid_keys: this.stats.valid,
      false_positives: this.stats.falsePositives,
      false_positive_rate: this.stats.total > 0 ? (this.stats.falsePositives / this.stats.total * 100).toFixed(1) : 0,
      categories: this.stats.categories,
      detailed_results: this.stats.validationResults.map(result => ({
        id: result.id,
        key_preview: result.key_preview,
        repo_name: result.repo_name,
        file_path: result.file_path,
        is_valid: result.isValid,
        reason: result.reason,
        category: result.category,
        confidence: result.confidence,
        details: result.details
      })),
      recommendations: this.generateRecommendations()
    };

    const reportPath = path.join(__dirname, '..', 'vertex-ai-analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 详细报告已保存至: ${reportPath}`);
  }

  generateRecommendations() {
    const recommendations = [];
    
    const falsePositiveRate = this.stats.total > 0 ? 
      (this.stats.falsePositives / this.stats.total * 100) : 0;

    if (falsePositiveRate > 50) {
      recommendations.push('假阳性率很高，建议执行清理脚本删除假阳性记录');
      recommendations.push('考虑加强 Vertex AI 密钥检测的上下文要求');
    }

    if (this.stats.categories.insufficient_context > this.stats.categories.hash_values) {
      recommendations.push('主要问题是上下文不足，建议提高上下文匹配要求');
    }

    if (this.stats.categories.generic_strings > 10) {
      recommendations.push('发现大量通用字符串，建议加强格式验证');
    }

    recommendations.push('运行清理脚本: npm run cleanup:vertex');
    
    return recommendations;
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Vertex AI 密钥分析报告');
    console.log('='.repeat(80));
    console.log(`📈 总计密钥: ${this.stats.total}`);
    console.log(`✅ 有效密钥: ${this.stats.valid} (${(this.stats.valid/this.stats.total*100).toFixed(1)}%)`);
    console.log(`❌ 假阳性: ${this.stats.falsePositives} (${(this.stats.falsePositives/this.stats.total*100).toFixed(1)}%)`);
    
    console.log('\n📋 假阳性分类:');
    Object.entries(this.stats.categories).forEach(([category, count]) => {
      if (count > 0) {
        const categoryNames = {
          hash_values: '🔗 哈希值类型',
          comments: '📝 注释中的密钥',
          insufficient_context: '📄 上下文不足',
          excluded_context: '🚫 排除的上下文',
          invalid_format: '❌ 格式无效',
          generic_strings: '🔤 通用字符串',
          file_paths: '📁 文件路径',
          encoded_data: '🔐 编码数据'
        };
        console.log(`   ${categoryNames[category] || category}: ${count} 个`);
      }
    });
    
    const falsePositiveRate = this.stats.total > 0 ? 
      (this.stats.falsePositives / this.stats.total * 100).toFixed(1) : 0;
    
    console.log('\n💡 建议:');
    if (falsePositiveRate > 70) {
      console.log('   - 假阳性率极高，强烈建议执行清理脚本删除假阳性记录');
      console.log('   - 需要大幅加强 Vertex AI 密钥检测逻辑');
    } else if (falsePositiveRate > 50) {
      console.log('   - 假阳性率很高，建议执行清理脚本删除假阳性记录');
      console.log('   - 考虑提高上下文匹配要求');
    } else {
      console.log('   - 假阳性率在可接受范围内');
    }
    console.log('   - 运行清理脚本: npm run cleanup:vertex');
    console.log('   - 或重新处理: npm run reprocess:vertex');
    
    console.log('='.repeat(80));
  }
}

// 运行分析器
async function main() {
  const analyzer = new VertexAIAnalyzer();
  await analyzer.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = VertexAIAnalyzer;