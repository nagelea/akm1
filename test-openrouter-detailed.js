// 详细测试OpenRouter密钥提取
const testKey = 'sk-or-v1-c73a5006e2ede5ae9dc65bdc0a743ce326a449ee6';

console.log('=== OpenRouter 密钥详细测试 ===');
console.log('测试密钥:', testKey);
console.log('密钥长度:', testKey.length);

// 当前OpenRouter模式
const openrouterPattern = /sk-or-v1-[a-f0-9]{64}(?![a-f0-9])|sk-or-[a-zA-Z0-9-]{32,68}(?![a-zA-Z0-9-])/g;

// 分解测试
const keyPart = testKey.replace('sk-or-v1-', '');
console.log('去掉前缀后:', keyPart);
console.log('去掉前缀后长度:', keyPart.length);

// 测试第一个模式 sk-or-v1-[a-f0-9]{64}
const pattern1 = /sk-or-v1-[a-f0-9]{64}(?![a-f0-9])/g;
const match1 = testKey.match(pattern1);
console.log('\n第一个模式 (sk-or-v1-[a-f0-9]{64}):');
console.log('匹配结果:', match1 ? '✅ 匹配' : '❌ 不匹配');
console.log('模式要求: 只能包含小写字母和数字, 64个字符');

// 检查字符类型
const hasUppercase = /[A-Z]/.test(keyPart);
const hasInvalidChars = /[^a-f0-9]/.test(keyPart);
console.log('包含大写字母:', hasUppercase ? '是' : '否');
console.log('包含非法字符:', hasInvalidChars ? '是' : '否');

// 测试第二个模式 sk-or-[a-zA-Z0-9-]{32,68}
const pattern2 = /sk-or-[a-zA-Z0-9-]{32,68}(?![a-zA-Z0-9-])/g;
const match2 = testKey.match(pattern2);
console.log('\n第二个模式 (sk-or-[a-zA-Z0-9-]{32,68}):');
console.log('匹配结果:', match2 ? '✅ 匹配' : '❌ 不匹配');

// 总的匹配结果
const totalMatch = testKey.match(openrouterPattern);
console.log('\n总的匹配结果:', totalMatch ? '✅ 匹配' : '❌ 不匹配');

// 改进的模式建议
const improvedPattern = /sk-or-v1-[a-zA-Z0-9]{40,64}(?![a-zA-Z0-9])/g;
const improvedMatch = testKey.match(improvedPattern);
console.log('\n改进模式匹配结果:', improvedMatch ? '✅ 匹配' : '❌ 不匹配');
console.log('改进模式:', improvedPattern);

// 测试所有字符
console.log('\n字符分析:');
for (let i = 0; i < keyPart.length; i++) {
  const char = keyPart[i];
  const isValid = /[a-f0-9]/.test(char);
  if (!isValid) {
    console.log(`位置 ${i}: '${char}' - 不符合 [a-f0-9] 模式`);
  }
}

console.log('\n实际密钥字符:', keyPart.split('').join(' '));