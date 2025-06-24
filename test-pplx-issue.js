// 测试PPLX密钥识别问题
const testKey = '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';

// 当前的PPLX模式
const currentPattern = /pplx-[a-zA-Z0-9]{56}/g;

// 测试模式
console.log('=== PPLX 密钥识别测试 ===');
console.log('测试密钥:', testKey);
console.log('密钥长度:', testKey.length);
console.log('去掉前缀后长度:', testKey.replace('pplx-', '').length);

// 当前模式测试
const currentMatch = testKey.match(currentPattern);
console.log('\n当前模式匹配结果:', currentMatch ? '✅ 匹配' : '❌ 不匹配');
console.log('当前模式:', currentPattern);

// 修正后的模式
const correctedPattern = /pplx-[a-zA-Z0-9]{48}/g;
const correctedMatch = testKey.match(correctedPattern);
console.log('\n修正模式匹配结果:', correctedMatch ? '✅ 匹配' : '❌ 不匹配');
console.log('修正模式:', correctedPattern);

// 更灵活的模式
const flexiblePattern = /pplx-[a-zA-Z0-9]{40,60}/g;
const flexibleMatch = testKey.match(flexiblePattern);
console.log('\n灵活模式匹配结果:', flexibleMatch ? '✅ 匹配' : '❌ 不匹配');
console.log('灵活模式:', flexiblePattern);

// Vertex AI 模式测试
const vertexPattern = /[a-zA-Z0-9_-]{40,200}(?![a-zA-Z0-9_-])/g;
const keyWithoutPrefix = testKey.replace('pplx-', '');
const vertexMatch = keyWithoutPrefix.match(vertexPattern);
console.log('\nVertex AI 模式匹配结果:', vertexMatch ? '✅ 匹配' : '❌ 不匹配');
console.log('Vertex AI 模式:', vertexPattern);
console.log('去掉前缀的密钥:', keyWithoutPrefix);
console.log('去掉前缀后长度:', keyWithoutPrefix.length);

// 检查其他测试密钥
console.log('\n=== 其他密钥测试 ===');
const otherKeys = [
  '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',
  'sk-or-v1-c73a5006e2ede5ae9dc65bdc0a743ce326a449ee6'
];

otherKeys.forEach((key, index) => {
  console.log(`\n密钥 ${index + 1}: ${key}`);
  console.log('长度:', key.length);
  
  if (key.startsWith('pplx-')) {
    const pplxPart = key.replace('pplx-', '');
    console.log('PPLX部分长度:', pplxPart.length);
    console.log('当前模式匹配:', key.match(currentPattern) ? '✅' : '❌');
    console.log('修正模式匹配:', key.match(correctedPattern) ? '✅' : '❌');
    console.log('灵活模式匹配:', key.match(flexiblePattern) ? '✅' : '❌');
  }
  
  if (key.startsWith('sk-or-v1-')) {
    const openrouterPattern = /sk-or-v1-[a-f0-9]{64}(?![a-f0-9])|sk-or-[a-zA-Z0-9-]{32,68}(?![a-zA-Z0-9-])/g;
    console.log('OpenRouter模式匹配:', key.match(openrouterPattern) ? '✅' : '❌');
  }
});