// 测试DEEPSEEK范围模式
const realDeepSeekKey = 'sk-fpifp5f293bak59ts7n71sohiqcnivi6qn9v9d08dcnhr9gp';
const problematicKeys = [
  'sk-proj-rW',
  'sk-proj-ji18cSbIlI8S', 
  'sk-svcacct-OJSK4F4L'
];

// 新的范围模式 (43-53字符)
const newPattern = /sk-[a-zA-Z0-9]{43,53}(?![a-zA-Z0-9])/g;

console.log('=== DEEPSEEK 范围模式测试 ===');
console.log('新模式: /sk-[a-zA-Z0-9]{43,53}(?![a-zA-Z0-9])/g');
console.log('范围: 48±5 = 43-53 字符 (去掉sk-前缀后)');

console.log('\n真实DeepSeek密钥测试:');
console.log('密钥:', realDeepSeekKey);
console.log('去掉前缀后长度:', realDeepSeekKey.replace('sk-', '').length);
console.log('匹配结果:', realDeepSeekKey.match(newPattern) ? '✅ 匹配' : '❌ 不匹配');

console.log('\n问题密钥测试:');
problematicKeys.forEach(key => {
  const afterPrefix = key.replace('sk-', '');
  console.log(`密钥: ${key}`);
  console.log(`去掉前缀后长度: ${afterPrefix.length}`);
  console.log(`匹配结果: ${key.match(newPattern) ? '✅ 匹配' : '❌ 不匹配'}`);
  console.log('');
});

console.log('=== 边界测试 ===');
// 测试边界情况
const boundaryTests = [
  'sk-' + 'a'.repeat(42), // 42字符 - 应该不匹配
  'sk-' + 'a'.repeat(43), // 43字符 - 应该匹配
  'sk-' + 'a'.repeat(48), // 48字符 - 应该匹配
  'sk-' + 'a'.repeat(53), // 53字符 - 应该匹配
  'sk-' + 'a'.repeat(54), // 54字符 - 应该不匹配
];

boundaryTests.forEach((testKey, index) => {
  const afterPrefix = testKey.replace('sk-', '');
  console.log(`边界测试 ${index + 1}: ${afterPrefix.length}字符 - ${testKey.match(newPattern) ? '✅' : '❌'}`);
});

console.log('\n=== 总结 ===');
console.log('✅ 真实DeepSeek密钥 (48字符): 正常匹配');
console.log('❌ 短的OpenAI片段 (2-12字符): 不再误匹配');  
console.log('📊 支持范围: 43-53字符 (±5字符容错)');