// 测试真实的DeepSeek密钥格式
const realDeepSeekKey = 'sk-fpifp5f293bak59ts7n71sohiqcnivi6qn9v9d08dcnhr9gp';
const problematicKeys = [
  'sk-proj-rW',
  'sk-proj-ji18cSbIlI8S', 
  'sk-svcacct-OJSK4F4L'
];

console.log('=== 真实 DeepSeek 密钥分析 ===');
console.log('密钥:', realDeepSeekKey);
console.log('总长度:', realDeepSeekKey.length);
console.log('去掉sk-前缀后:', realDeepSeekKey.replace('sk-', ''));
console.log('去掉sk-前缀后长度:', realDeepSeekKey.replace('sk-', '').length);

// 当前模式测试
const currentPattern = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+(?![a-zA-Z0-9-])/g;
console.log('\n当前DEEPSEEK模式匹配:', realDeepSeekKey.match(currentPattern) ? '✅' : '❌');

// 分析子模式
const pattern1 = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])/g;
const pattern2 = /sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+(?![a-zA-Z0-9-])/g;

console.log('子模式1 (sk-[a-zA-Z0-9]{48}):', realDeepSeekKey.match(pattern1) ? '✅' : '❌');
console.log('子模式2 (sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+):', realDeepSeekKey.match(pattern2) ? '✅' : '❌');

console.log('\n=== 改进方案分析 ===');

// 方案1: 排除OpenAI前缀 + 最小长度要求
const improved1 = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-(?!proj-|user-|svcacct-)[a-zA-Z0-9]+-[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/g;
console.log('方案1 (排除OpenAI前缀+最小8字符):');
console.log('  真实DeepSeek:', realDeepSeekKey.match(improved1) ? '✅' : '❌');
problematicKeys.forEach(key => {
  console.log(`  ${key}:`, key.match(improved1) ? '✅' : '❌');
});

// 方案2: 更严格的长度要求
const improved2 = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-(?!proj-|user-|svcacct-)[a-zA-Z0-9]+-[a-zA-Z0-9]{20,}(?![a-zA-Z0-9-])/g;
console.log('\n方案2 (排除OpenAI前缀+最小20字符):');
console.log('  真实DeepSeek:', realDeepSeekKey.match(improved2) ? '✅' : '❌');
problematicKeys.forEach(key => {
  console.log(`  ${key}:`, key.match(improved2) ? '✅' : '❌');
});

// 方案3: 只保留第一个子模式（48字符固定长度）
const improved3 = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])/g;
console.log('\n方案3 (只保留48字符固定长度):');
console.log('  真实DeepSeek:', realDeepSeekKey.match(improved3) ? '✅' : '❌');
problematicKeys.forEach(key => {
  console.log(`  ${key}:`, key.match(improved3) ? '✅' : '❌');
});

console.log('\n=== 建议 ===');
console.log('基于真实DeepSeek密钥长度为50字符的观察：');
console.log('- 去掉sk-前缀后为48字符');
console.log('- 建议使用方案3：只保留固定48字符长度的模式');
console.log('- 这样可以避免误匹配短的OpenAI密钥片段');
console.log('- 如果DeepSeek有其他格式，需要单独添加特定模式');