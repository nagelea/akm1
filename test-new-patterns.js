// 测试新增的AI API密钥模式
const testKeys = {
  openrouter: 'sk-or-v1-abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
  perplexity: 'pplx-abcd1234567890abcdef1234567890abcdef1234567890abcdef123456',
  groq: 'gsk_abcd1234567890abcdef1234567890abcdef1234567890abcdef1234',
  fireworks: 'fw_abcd1234567890abcdef1234567890abcdef12',
  anyscale: 'esecret_abcd1234567890abcdef1234567890ab',
  voyage: 'pa-abcd1234567890abcdef1234567890abcdef1234567_',
  elevenlabs: 'abcd1234567890abcdef1234567890ab',
  runpod: 'ABCD1234-ABCD-1234-ABCD-123456789012'
};

// 新的密钥模式
const NEW_KEY_PATTERNS = {
  openrouter: {
    pattern: /sk-or-v1-[a-zA-Z0-9]{64}/g,
    name: 'OpenRouter',
    confidence: 'high'
  },
  perplexity: {
    pattern: /pplx-[a-zA-Z0-9]{56}/g,
    name: 'Perplexity AI',
    confidence: 'high'
  },
  groq: {
    pattern: /gsk_[a-zA-Z0-9]{52}/g,
    name: 'Groq',
    confidence: 'high'
  },
  fireworks: {
    pattern: /fw_[a-zA-Z0-9]{40}/g,
    name: 'Fireworks AI',
    confidence: 'high'
  },
  anyscale: {
    pattern: /esecret_[a-zA-Z0-9]{32}/g,
    name: 'Anyscale',
    confidence: 'high'
  },
  voyage: {
    pattern: /pa-[a-zA-Z0-9_-]{43}/g,
    name: 'Voyage AI',
    confidence: 'high'
  },
  elevenlabs: {
    pattern: /[a-f0-9]{32}/g,
    name: 'ElevenLabs',
    confidence: 'low',
    context_required: ['elevenlabs', 'eleven']
  },
  runpod: {
    pattern: /[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/g,
    name: 'RunPod',
    confidence: 'medium',
    context_required: ['runpod']
  }
};

console.log('=== 测试新增AI服务密钥模式 ===\n');

function testKeyPattern(serviceName, key, pattern) {
  const matches = key.match(pattern.pattern);
  const result = matches ? '✅ MATCH' : '❌ NO MATCH';
  console.log(`${serviceName}: ${result}`);
  if (matches) {
    console.log(`  Pattern: ${pattern.pattern}`);
    console.log(`  Matched: ${matches[0]}`);
    console.log(`  Service: ${pattern.name}`);
    console.log(`  Confidence: ${pattern.confidence}`);
    if (pattern.context_required) {
      console.log(`  Context Required: ${pattern.context_required.join(', ')}`);
    }
  }
  console.log('');
}

// 测试所有新密钥
for (const [serviceName, key] of Object.entries(testKeys)) {
  const pattern = NEW_KEY_PATTERNS[serviceName];
  if (pattern) {
    testKeyPattern(serviceName, key, pattern);
  }
}

console.log('=== 统计信息 ===');
console.log(`总共支持的AI服务: ${Object.keys(NEW_KEY_PATTERNS).length + 8} 种`);
console.log('新增服务:', Object.keys(NEW_KEY_PATTERNS).join(', '));
console.log('原有服务: OpenAI, Anthropic, Google, HuggingFace, Replicate, Cohere, Azure OpenAI, Mistral');

console.log('\n=== 搜索查询测试 ===');
const searchQueries = [
  '"sk-or-v1-" language:python NOT is:fork',
  '"pplx-" language:python NOT is:fork',
  '"gsk_" language:python NOT is:fork',
  '"fw_" language:python NOT is:fork',
  '"esecret_" language:python NOT is:fork',
  '"pa-" language:python NOT is:fork'
];

console.log('GitHub搜索查询:');
searchQueries.forEach((query, index) => {
  console.log(`${index + 1}. ${query}`);
});

console.log('\n✅ 新密钥模式测试完成！');