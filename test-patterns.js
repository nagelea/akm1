// 测试API密钥模式匹配
const testKey = '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';

console.log('Testing key:', testKey);
console.log('Key length:', testKey.length);

// 当前模式
const currentPatterns = {
  anthropic: /sk-ant-[a-zA-Z0-9_-]{95}/g,
  mistral: /[a-zA-Z0-9]{32}/g,
  openai: /sk-[a-zA-Z0-9]{48}/g,
};

console.log('\n=== Current Pattern Tests ===');
for (const [type, pattern] of Object.entries(currentPatterns)) {
  const matches = testKey.match(pattern);
  console.log(`${type}: ${pattern} -> ${matches ? 'MATCH' : 'NO MATCH'}`);
  if (matches) console.log(`  Matched: ${matches[0]}`);
}

// 分析Anthropic密钥结构
console.log('\n=== Anthropic Key Analysis ===');
const parts = testKey.split('-');
console.log('Parts:', parts);
console.log('Part lengths:', parts.map(p => p.length));

// 正确的Anthropic模式应该是：sk-ant-api03-[base64字符串]
const correctAnthropicPattern = /sk-ant-api\d+-[a-zA-Z0-9_-]+/g;
console.log('Correct Anthropic pattern:', correctAnthropicPattern);
console.log('Test with correct pattern:', testKey.match(correctAnthropicPattern) ? 'MATCH' : 'NO MATCH');

// 检查Mistral是否误匹配
const mistralPart = testKey.substring(testKey.length - 32);
console.log('\n=== Mistral Mismatch Analysis ===');
console.log('Last 32 chars:', mistralPart);
console.log('Mistral pattern matches this?', /^[a-zA-Z0-9]{32}$/.test(mistralPart));