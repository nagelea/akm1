#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 初始化 Supabase 客户端
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 帮助信息
function showHelp() {
  console.log(`
🔑 API密钥导出工具

用法:
  node export-keys.js [选项]

选项:
  --type <type>        指定密钥类型 (如: openai, anthropic, google_api, xai 等)
  --status <status>    指定密钥状态 (valid, invalid, unknown, revoked)
  --format <format>    导出格式 (json, csv, txt) [默认: json]
  --output <file>      输出文件路径 [默认: 自动生成]
  --include-sensitive  包含敏感信息 (完整密钥) [默认: false]
  --limit <number>     限制导出数量 [默认: 无限制]
  --help              显示此帮助信息

示例:
  # 导出所有 OpenAI 密钥为 JSON 格式
  node export-keys.js --type openai

  # 导出所有有效的 Google API 密钥为 CSV 格式
  node export-keys.js --type google_api --status valid --format csv

  # 导出所有 xAI 密钥，包含完整密钥信息
  node export-keys.js --type xai --include-sensitive

  # 导出前100个 Anthropic 密钥
  node export-keys.js --type anthropic --limit 100

支持的密钥类型:
  openai, openai_project, openai_user, openai_service, deepseek, xai, 
  anthropic, google_api, openrouter, huggingface, replicate, perplexity,
  groq, fireworks, together 等
  `);
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: null,
    status: null,
    format: 'json',
    output: null,
    includeSensitive: false,
    limit: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        options.type = args[++i];
        break;
      case '--status':
        options.status = args[++i];
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--include-sensitive':
        options.includeSensitive = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
      default:
        console.error(`❌ 未知参数: ${args[i]}`);
        console.log('使用 --help 查看帮助信息');
        process.exit(1);
    }
  }

  return options;
}

// 验证选项
function validateOptions(options) {
  const validFormats = ['json', 'csv', 'txt'];
  const validStatuses = ['valid', 'invalid', 'unknown', 'revoked'];

  if (options.format && !validFormats.includes(options.format)) {
    console.error(`❌ 无效的格式: ${options.format}`);
    console.log(`支持的格式: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  if (options.status && !validStatuses.includes(options.status)) {
    console.error(`❌ 无效的状态: ${options.status}`);
    console.log(`支持的状态: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  if (options.limit && (options.limit <= 0 || !Number.isInteger(options.limit))) {
    console.error(`❌ 无效的限制数量: ${options.limit}`);
    process.exit(1);
  }
}

// 生成输出文件名
function generateOutputFileName(options) {
  if (options.output) {
    return options.output;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const typeFilter = options.type ? `_${options.type}` : '';
  const statusFilter = options.status ? `_${options.status}` : '';
  
  return `keys_export${typeFilter}${statusFilter}_${timestamp}.${options.format}`;
}

// 从数据库获取密钥
async function fetchKeys(options) {
  try {
    console.log('🔍 正在查询密钥...');
    
    let query = supabase
      .from('leaked_keys')
      .select(`
        id,
        key_type,
        key_preview,
        status,
        first_seen,
        last_verified,
        source_type,
        file_extension,
        repo_language,
        repo_name,
        file_path,
        context_preview,
        severity,
        confidence,
        created_at,
        updated_at
      `);

    // 应用过滤条件
    if (options.type) {
      query = query.eq('key_type', options.type);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    // 应用限制
    if (options.limit) {
      query = query.limit(options.limit);
    }

    // 按创建时间降序排列
    query = query.order('created_at', { ascending: false });

    const { data: keys, error } = await query;

    if (error) {
      throw error;
    }

    console.log(`✅ 找到 ${keys.length} 个密钥`);

    // 如果需要包含敏感信息，获取完整密钥
    if (options.includeSensitive && keys.length > 0) {
      console.log('🔐 正在获取敏感信息...');
      
      const keyIds = keys.map(k => k.id);
      const { data: sensitiveData, error: sensitiveError } = await supabase
        .from('leaked_keys_sensitive')
        .select('key_id, full_key, raw_context, github_url')
        .in('key_id', keyIds);

      if (sensitiveError) {
        console.warn('⚠️  无法获取敏感信息:', sensitiveError.message);
      } else {
        // 合并敏感数据
        const sensitiveMap = new Map(sensitiveData.map(s => [s.key_id, s]));
        keys.forEach(key => {
          const sensitive = sensitiveMap.get(key.id);
          if (sensitive) {
            key.full_key = sensitive.full_key;
            key.raw_context = sensitive.raw_context;
            key.github_url = sensitive.github_url;
          }
        });
        console.log(`✅ 获取了 ${sensitiveData.length} 个密钥的完整信息`);
      }
    }

    return keys;
  } catch (error) {
    console.error('❌ 数据库查询失败:', error.message);
    process.exit(1);
  }
}

// 导出为 JSON 格式
function exportAsJSON(keys, filename) {
  const data = {
    export_info: {
      timestamp: new Date().toISOString(),
      total_count: keys.length,
      format: 'json'
    },
    keys: keys
  };

  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
}

// 导出为 CSV 格式
function exportAsCSV(keys, filename) {
  if (keys.length === 0) {
    fs.writeFileSync(filename, 'No keys found\n', 'utf8');
    return;
  }

  // CSV 头部
  const headers = Object.keys(keys[0]);
  let csv = headers.join(',') + '\n';

  // CSV 数据行
  keys.forEach(key => {
    const row = headers.map(header => {
      let value = key[header];
      if (value === null || value === undefined) {
        return '';
      }
      // 转义CSV中的特殊字符
      if (typeof value === 'string') {
        value = value.replace(/"/g, '""');
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          value = `"${value}"`;
        }
      }
      return value;
    });
    csv += row.join(',') + '\n';
  });

  fs.writeFileSync(filename, csv, 'utf8');
}

// 导出为 TXT 格式
function exportAsTXT(keys, filename) {
  let content = `API 密钥导出报告
导出时间: ${new Date().toISOString()}
总数量: ${keys.length}
${'='.repeat(60)}\n\n`;

  keys.forEach((key, index) => {
    content += `密钥 #${index + 1}\n`;
    content += `ID: ${key.id}\n`;
    content += `类型: ${key.key_type}\n`;
    content += `预览: ${key.key_preview}\n`;
    content += `状态: ${key.status}\n`;
    content += `首次发现: ${key.first_seen}\n`;
    content += `仓库: ${key.repo_name || 'N/A'}\n`;
    content += `文件: ${key.file_path || 'N/A'}\n`;
    content += `严重程度: ${key.severity}\n`;
    content += `置信度: ${key.confidence}\n`;
    
    if (key.full_key) {
      content += `完整密钥: ${key.full_key}\n`;
    }
    
    if (key.github_url) {
      content += `GitHub链接: ${key.github_url}\n`;
    }
    
    content += `${'─'.repeat(40)}\n\n`;
  });

  fs.writeFileSync(filename, content, 'utf8');
}

// 主函数
async function main() {
  console.log('🔑 API密钥导出工具\n');

  // 检查环境变量
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少必要的环境变量:');
    console.error('- SUPABASE_URL');
    console.error('- SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  // 解析和验证参数
  const options = parseArgs();
  validateOptions(options);

  // 显示配置信息
  console.log('📋 导出配置:');
  if (options.type) console.log(`   类型过滤: ${options.type}`);
  if (options.status) console.log(`   状态过滤: ${options.status}`);
  console.log(`   导出格式: ${options.format}`);
  if (options.limit) console.log(`   数量限制: ${options.limit}`);
  console.log(`   包含敏感信息: ${options.includeSensitive ? '是' : '否'}`);
  console.log();

  // 获取密钥数据
  const keys = await fetchKeys(options);

  if (keys.length === 0) {
    console.log('📭 未找到匹配的密钥');
    return;
  }

  // 生成输出文件名
  const filename = generateOutputFileName(options);

  // 根据格式导出
  console.log(`💾 正在导出到: ${filename}`);
  
  try {
    switch (options.format) {
      case 'json':
        exportAsJSON(keys, filename);
        break;
      case 'csv':
        exportAsCSV(keys, filename);
        break;
      case 'txt':
        exportAsTXT(keys, filename);
        break;
    }

    console.log(`✅ 导出完成! 共导出 ${keys.length} 个密钥`);
    console.log(`📄 文件保存在: ${path.resolve(filename)}`);
    
    // 显示文件大小
    const stats = fs.statSync(filename);
    const fileSize = (stats.size / 1024).toFixed(2);
    console.log(`📊 文件大小: ${fileSize} KB`);

  } catch (error) {
    console.error('❌ 文件写入失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 程序执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, validateOptions };