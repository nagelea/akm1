// 测试修复后的API密钥模式匹配
const testKey = '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';

// 修复后的模式（按优先级排序）
const FIXED_KEY_PATTERNS = {
  anthropic: {
    pattern: /sk-ant-api\d+-[a-zA-Z0-9_-]+/g,
    name: 'Anthropic Claude',
    confidence: 'high'
  },
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'OpenAI',
    confidence: 'high'
  },
  mistral: {
    pattern: /[a-zA-Z0-9]{32}/g,
    name: 'Mistral AI',
    confidence: 'low',
    context_required: ['mistral']
  }
};

console.log('Testing key:', testKey);
console.log('Key length:', testKey.length);

// 模拟扫描器的检测逻辑
function detectKeyType(key, content = '') {
  for (const [type, config] of Object.entries(FIXED_KEY_PATTERNS)) {
    const matches = key.match(config.pattern);
    if (matches) {
      // 检查上下文要求
      if (config.context_required) {
        const hasContext = config.context_required.some(ctx => 
          content.toLowerCase().includes(ctx.toLowerCase())
        );
        if (!hasContext) {
          console.log(`  ${type}: PATTERN MATCH but FAILED CONTEXT CHECK`);
          continue;
        }
      }
      console.log(`  ${type}: MATCH - ${config.name}`);
      return { type, config, match: matches[0] };
    }
  }
  return null;
}

console.log('\n=== Fixed Pattern Detection ===');

// 测试1: 只有密钥，没有上下文
console.log('Test 1: Key without context');
const result1 = detectKeyType(testKey, '');

// 测试2: 有Anthropic上下文
console.log('\nTest 2: Key with Anthropic context');
const contextWithAnthropic = 'import anthropic\nfrom anthropic import Anthropic\nANTHROPIC_API_KEY = "' + testKey + '"';
const result2 = detectKeyType(testKey, contextWithAnthropic);

// 测试3: 有Mistral上下文（应该仍然匹配Anthropic）
console.log('\nTest 3: Key with Mistral context');
const contextWithMistral = 'from mistral import MistralClient\nMISTRAL_API_KEY = "' + testKey + '"';
const result3 = detectKeyType(testKey, contextWithMistral);

console.log('\n=== Final Results ===');
console.log('Result 1:', result1?.type || 'No match');
console.log('Result 2:', result2?.type || 'No match');
console.log('Result 3:', result3?.type || 'No match');

console.log('\n✅ Expected: All should detect as "anthropic"');