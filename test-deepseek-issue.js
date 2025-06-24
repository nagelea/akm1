// 测试DEEPSEEK误匹配问题
const problematicKeys = [
  'sk-proj-rW',
  'sk-proj-ji18cSbIlI8S', 
  'sk-svcacct-OJSK4F4L'
];

// 相关模式
const patterns = {
  openai_project: /sk-proj-[a-zA-Z0-9]{40,}(?![a-zA-Z0-9])/g,
  openai_service: /sk-svcacct-[a-zA-Z0-9]{40,}(?![a-zA-Z0-9])/g,
  deepseek: /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+(?![a-zA-Z0-9-])/g,
  openai: /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-(?:proj|user|svcacct)-[a-zA-Z0-9]{40,}(?![a-zA-Z0-9])/g
};

console.log('=== DEEPSEEK 误匹配问题分析 ===\n');

problematicKeys.forEach((key, index) => {
  console.log(`密钥 ${index + 1}: ${key}`);
  console.log('长度:', key.length);
  
  // 检查各个模式
  Object.entries(patterns).forEach(([name, pattern]) => {
    const matches = key.match(pattern);
    const result = matches ? '✅ 匹配' : '❌ 不匹配';
    console.log(`  ${name}: ${result}`);
    if (matches) {
      console.log(`    匹配内容: "${matches[0]}"`);
    }
  });
  
  // 分析为什么DEEPSEEK会匹配
  const deepseekPattern1 = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])/g;
  const deepseekPattern2 = /sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+(?![a-zA-Z0-9-])/g;
  
  console.log('  DEEPSEEK子模式分析:');
  console.log(`    模式1 (sk-[a-zA-Z0-9]{48}): ${key.match(deepseekPattern1) ? '✅' : '❌'}`);
  console.log(`    模式2 (sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+): ${key.match(deepseekPattern2) ? '✅' : '❌'}`);
  
  // 分析长度问题
  if (key.startsWith('sk-proj-')) {
    const afterPrefix = key.replace('sk-proj-', '');
    console.log(`  去掉sk-proj-后: "${afterPrefix}" (长度: ${afterPrefix.length})`);
    console.log(`  OpenAI Project要求: 至少40个字符`);
  } else if (key.startsWith('sk-svcacct-')) {
    const afterPrefix = key.replace('sk-svcacct-', '');
    console.log(`  去掉sk-svcacct-后: "${afterPrefix}" (长度: ${afterPrefix.length})`);
    console.log(`  OpenAI Service要求: 至少40个字符`);
  }
  
  console.log('');
});

console.log('=== 问题总结 ===');
console.log('1. DEEPSEEK模式 sk-[a-zA-Z0-9]+-[a-zA-Z0-9]+ 过于宽泛');
console.log('2. 匹配了不完整的OpenAI密钥（长度不足40字符）');
console.log('3. 需要改进DEEPSEEK模式，避免误匹配OpenAI格式');
console.log('4. 或者调整模式优先级，确保OpenAI模式优先匹配');

console.log('\n=== 建议的修复方案 ===');
console.log('1. 修改DEEPSEEK模式，排除sk-proj-和sk-svcacct-格式');
console.log('2. 或者增加最小长度要求');
console.log('3. 改进的DEEPSEEK模式建议:');
console.log('   /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-(?!proj-|user-|svcacct-)[a-zA-Z0-9]+-[a-zA-Z0-9]+(?![a-zA-Z0-9-])/g');