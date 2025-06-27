#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 帮助信息
function showHelp() {
  console.log(`
🔑 API密钥提取工具

用法:
  node extract-keys.js <输入文件> [选项]

选项:
  --output <file>      输出文件路径 [默认: extracted-keys.txt]
  --format <format>    输出格式 (list, json) [默认: list]
  --help              显示此帮助信息

示例:
  # 从导出文件提取完整密钥列表
  node extract-keys.js keys_export_google_api_2025-06-25T12-59-29.txt

  # 提取并保存为JSON格式
  node extract-keys.js keys_export.txt --format json --output keys.json

  # 提取并保存为指定文件
  node extract-keys.js keys_export.txt --output my-keys.txt
  `);
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ 请提供输入文件路径');
    showHelp();
    process.exit(1);
  }

  const options = {
    inputFile: args[0],
    output: null,
    format: 'list'
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
        options.output = args[++i];
        break;
      case '--format':
        options.format = args[++i];
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
  const validFormats = ['list', 'json'];

  if (!fs.existsSync(options.inputFile)) {
    console.error(`❌ 输入文件不存在: ${options.inputFile}`);
    process.exit(1);
  }

  if (!validFormats.includes(options.format)) {
    console.error(`❌ 无效的格式: ${options.format}`);
    console.log(`支持的格式: ${validFormats.join(', ')}`);
    process.exit(1);
  }
}

// 生成输出文件名
function generateOutputFileName(options) {
  if (options.output) {
    return options.output;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const extension = options.format === 'json' ? 'json' : 'txt';
  
  return `extracted-keys_${timestamp}.${extension}`;
}

// 从TXT文件提取完整密钥
function extractKeysFromTxt(content) {
  const keys = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 查找完整密钥行
    if (line.startsWith('完整密钥: ')) {
      const key = line.replace('完整密钥: ', '').trim();
      if (key && key !== 'undefined' && key !== 'null') {
        keys.push(key);
      }
    }
  }
  
  return keys;
}

// 导出为列表格式
function exportAsList(keys, filename) {
  let content = `# API 密钥列表
# 提取时间: ${new Date().toISOString()}
# 总数量: ${keys.length}
# ===================================

`;

  keys.forEach((key, index) => {
    content += `${key}\n`;
  });

  fs.writeFileSync(filename, content, 'utf8');
}

// 导出为JSON格式
function exportAsJSON(keys, filename) {
  const data = {
    extract_info: {
      timestamp: new Date().toISOString(),
      total_count: keys.length,
      format: 'json'
    },
    keys: keys
  };

  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
}

// 主函数
function main() {
  console.log('🔑 API密钥提取工具\n');

  // 解析和验证参数
  const options = parseArgs();
  validateOptions(options);

  console.log(`📖 正在读取文件: ${options.inputFile}`);
  
  try {
    // 读取输入文件
    const content = fs.readFileSync(options.inputFile, 'utf8');
    
    // 提取完整密钥
    const keys = extractKeysFromTxt(content);
    
    if (keys.length === 0) {
      console.log('⚠️  未找到任何完整密钥');
      return;
    }

    console.log(`✅ 成功提取 ${keys.length} 个完整密钥`);

    // 生成输出文件名
    const outputFile = generateOutputFileName(options);

    console.log(`💾 正在保存到: ${outputFile}`);
    
    // 根据格式导出
    switch (options.format) {
      case 'list':
        exportAsList(keys, outputFile);
        break;
      case 'json':
        exportAsJSON(keys, outputFile);
        break;
    }

    console.log(`✅ 提取完成!`);
    console.log(`📄 文件保存在: ${path.resolve(outputFile)}`);
    
    // 显示文件大小
    const stats = fs.statSync(outputFile);
    const fileSize = (stats.size / 1024).toFixed(2);
    console.log(`📊 文件大小: ${fileSize} KB`);

    // 显示去重信息
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length !== keys.length) {
      console.log(`🔄 去重后: ${uniqueKeys.length} 个唯一密钥 (原有 ${keys.length - uniqueKeys.length} 个重复)`);
    }

  } catch (error) {
    console.error('❌ 处理失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { main, parseArgs, validateOptions, extractKeysFromTxt };