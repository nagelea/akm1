#!/usr/bin/env node

/**
 * 测试 OpenRouter 密钥模式修复
 */

// 测试用的OpenRouter密钥格式
const testCases = [
  {
    description: 'OpenRouter v1 format (问题案例)',
    content: 'os.environ["OPENROUTER_API_KEY"] = "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"',
    expectedKey: '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',
    expectedType: 'openrouter'
  },
  {
    description: 'OpenRouter old format',
    content: 'OPENROUTER_API_KEY="sk-or-abc123def456-789xyz"',
    expectedKey: 'sk-or-abc123def456-789xyz',
    expectedType: 'openrouter'
  },
  {
    description: 'Azure OpenAI context',
    content: 'azure_openai_key = "a1b2c3d4e5f6789012345678901234567890abcd"',
    expectedType: 'azure_openai'
  }
];

// 定义模式（修复后的）
const patterns = {
  openrouter: {
    pattern: /sk-or-v1-[a-f0-9]{64}(?![a-f0-9])|sk-or-[a-zA-Z0-9-]{32,70}(?![a-zA-Z0-9-])/g,
    name: 'OpenRouter',
    confidence: 'high'
  },
  azure_openai: {
    pattern: /[a-f0-9]{32}(?![a-f0-9])/g,
    name: 'Azure OpenAI',
    confidence: 'low',
    context_required: ['azure', 'openai']
  }
};

function hasValidContext(key, content, type) {
  const keyIndex = content.indexOf(key);
  const contextStart = Math.max(0, keyIndex - 200);
  const contextEnd = Math.min(content.length, keyIndex + key.length + 200);
  const context = content.substring(contextStart, contextEnd).toLowerCase();
  
  const keyConfig = patterns[type];
  const requiredContexts = keyConfig?.context_required || [];
  
  if (requiredContexts.length === 0) return true;
  
  const matchingContexts = requiredContexts.filter(ctx => context.includes(ctx.toLowerCase()));
  const minMatches = keyConfig?.min_context_matches || 1;
  
  return matchingContexts.length >= minMatches;
}

function testPatterns() {
  console.log('🧪 测试修复后的密钥模式匹配\n');
  
  testCases.forEach((testCase, index) => {
    console.log(`📋 测试用例 ${index + 1}: ${testCase.description}`);
    console.log(`   内容: ${testCase.content}`);
    
    // 按置信度排序测试（high -> medium -> low）
    const sortedPatterns = Object.entries(patterns).sort((a, b) => {
      const confidenceOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      return confidenceOrder[a[1].confidence] - confidenceOrder[b[1].confidence];
    });
    
    const processedKeys = new Set();
    let foundExpected = false;
    
    for (const [type, config] of sortedPatterns) {
      const matches = testCase.content.match(config.pattern);
      if (matches) {
        for (const key of matches) {
          // 防止重复处理
          if (processedKeys.has(key)) {
            console.log(`   🔄 跳过重复密钥: ${key.substring(0, 20)}... (已被高置信度模式处理)`);
            continue;
          }
          
          // 低置信度需要上下文验证
          if (config.confidence === 'low' && !hasValidContext(key, testCase.content, type)) {
            console.log(`   ❌ ${type} 上下文验证失败: ${key.substring(0, 20)}...`);
            continue;
          }
          
          processedKeys.add(key);
          console.log(`   ✅ ${config.confidence} 置信度 ${type} 匹配: ${key}`);
          
          if (testCase.expectedKey && key === testCase.expectedKey && type === testCase.expectedType) {
            console.log(`   🎯 正确匹配期望的密钥类型！`);
            foundExpected = true;
          }
        }
      }
    }
    
    if (testCase.expectedKey && !foundExpected) {
      console.log(`   ❌ 未能正确匹配期望的密钥`);
    }
    
    console.log('');
  });
  
  console.log('🎯 关键修复点:');
  console.log('   1. ✅ OpenRouter 模式支持 sk-or-v1- 格式');
  console.log('   2. ✅ 按置信度优先级处理 (high -> medium -> low)');
  console.log('   3. ✅ 防止重复匹配同一个密钥');
  console.log('   4. ✅ Azure OpenAI 需要上下文验证');
  console.log('\n🏁 测试完成');
}

// 运行测试
testPatterns();