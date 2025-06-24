#!/usr/bin/env node

// 测试 OpenAI 和 DeepSeek 密钥检测优先级
const fs = require('fs');
const path = require('path');

// 读取 scanner.js 文件中的 KEY_PATTERNS
const scannerPath = path.join(__dirname, 'scripts', 'scanner.js');
const scannerContent = fs.readFileSync(scannerPath, 'utf8');

// 提取 KEY_PATTERNS 定义
const patternsMatch = scannerContent.match(/const KEY_PATTERNS = \{([\s\S]*?)\};/);
if (!patternsMatch) {
  console.error('❌ 无法找到 KEY_PATTERNS 定义');
  process.exit(1);
}

// 模拟 KEY_PATTERNS 对象
const KEY_PATTERNS = {
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-(?:proj|user|svcacct)-[a-zA-Z0-9]{40,}(?![a-zA-Z0-9])/g,
    name: 'OpenAI',
    confidence: 'high',
    context_exclude: ['deepseek', 'claude', 'anthropic']
  },
  deepseek: {
    pattern: /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])/g,
    name: 'DeepSeek',
    confidence: 'high',
    context_required: ['deepseek']
  }
};

// 测试用例 - 使用48个字符的密钥
const testCases = [
  {
    name: '标准 OpenAI 密钥 (无特殊上下文)',
    key: 'sk-1234567890abcdef1234567890abcdef1234567890abc',
    context: `
      const client = new OpenAI({
        apiKey: 'sk-1234567890abcdef1234567890abcdef1234567890abc'
      });
    `,
    expectedType: 'openai',
    expectedResult: true
  },
  {
    name: 'DeepSeek 密钥 (有 deepseek 上下文)',
    key: 'sk-1234567890abcdef1234567890abcdef1234567890abc',
    context: `
      // DeepSeek API configuration
      const apiKey = 'sk-1234567890abcdef1234567890abcdef1234567890abc';
      const deepseekClient = new DeepSeek(apiKey);
    `,
    expectedType: 'deepseek',
    expectedResult: true
  },
  {
    name: '密钥在非 DeepSeek 上下文中',
    key: 'sk-1234567890abcdef1234567890abcdef1234567890abc',
    context: `
      const openaiApiKey = 'sk-1234567890abcdef1234567890abcdef1234567890abc';
      // This is for OpenAI ChatGPT
    `,
    expectedType: 'openai',
    expectedResult: true
  },
  {
    name: '密钥在 DeepSeek 上下文中但检测为 OpenAI (应该被 exclude)',
    key: 'sk-1234567890abcdef1234567890abcdef1234567890abc',
    context: `
      import { deepseek } from 'deepseek-api';
      const key = 'sk-1234567890abcdef1234567890abcdef1234567890abc';
    `,
    expectedType: 'deepseek',
    expectedResult: true
  }
];

// 模拟 hasValidContext 函数
function hasValidContext(key, content, type) {
  const keyIndex = content.indexOf(key);
  const contextStart = Math.max(0, keyIndex - 200);
  const contextEnd = Math.min(content.length, keyIndex + key.length + 200);
  const context = content.substring(contextStart, contextEnd).toLowerCase();
  
  const keyConfig = KEY_PATTERNS[type];
  if (!keyConfig) return false;
  
  const requiredContexts = keyConfig.context_required || [];
  const excludeContexts = keyConfig.context_exclude || [];
  
  // 检查是否包含排除的上下文关键词
  if (excludeContexts.length > 0) {
    const hasExcluded = excludeContexts.some(ctx => context.includes(ctx.toLowerCase()));
    if (hasExcluded) return false;
  }
  
  // 如果没有上下文要求，直接通过
  if (requiredContexts.length === 0) return true;
  
  // 检查是否包含必需上下文关键词
  return requiredContexts.some(ctx => context.includes(ctx.toLowerCase()));
}

// 模拟检测逻辑
function detectKeyType(key, content) {
  console.log(`🔍 检测密钥: ${key} (长度: ${key.length})`);
  
  const processedKeys = new Set();
  const foundKeys = [];
  
  // 按照文件中的顺序检测 (OpenAI 在 DeepSeek 前面)
  const patterns = [
    ['openai', KEY_PATTERNS.openai],
    ['deepseek', KEY_PATTERNS.deepseek]
  ];
  
  for (const [type, config] of patterns) {
    console.log(`🔎 测试模式: ${type} - ${config.pattern}`);
    
    // 重置正则表达式的 lastIndex
    config.pattern.lastIndex = 0;
    const matches = content.match(config.pattern);
    
    console.log(`📋 模式 ${type} 匹配结果:`, matches ? matches.length : 0);
    
    if (matches && matches.includes(key)) {
      console.log(`✅ 密钥匹配模式 ${type}`);
      
      if (processedKeys.has(key)) {
        console.log(`🔄 跳过重复密钥 (已被更高优先级模式处理): ${type}`);
        continue;
      }
      
      if (hasValidContext(key, content, type)) {
        foundKeys.push({ key, type, confidence: config.confidence });
        processedKeys.add(key);
        console.log(`✅ 检测到 ${config.confidence} 置信度 ${type} 密钥`);
        break; // 找到第一个匹配就停止
      } else {
        console.log(`❌ 密钥未通过上下文验证: ${type}`);
      }
    } else {
      console.log(`❌ 密钥不匹配模式 ${type}`);
    }
  }
  
  return foundKeys[0] || null;
}

// 运行测试
console.log('🧪 测试 OpenAI 和 DeepSeek 密钥检测优先级\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log('=' .repeat(50));
  
  const result = detectKeyType(testCase.key, testCase.context);
  
  if (result) {
    const typeMatch = result.type === testCase.expectedType;
    const status = typeMatch ? '✅' : '❌';
    
    console.log(`${status} 检测结果: ${result.type} (期望: ${testCase.expectedType})`);
    
    if (!typeMatch) {
      console.log('❌ 测试失败');
    } else {
      console.log('✅ 测试通过');
    }
  } else {
    console.log(`❌ 未检测到密钥 (期望: ${testCase.expectedType})`);
  }
  
  console.log();
});

console.log('🏁 测试完成');