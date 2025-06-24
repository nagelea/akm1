const key = 'sk-1234567890abcdef1234567890abcdef1234567890abc';
const context1 = `const client = new OpenAI({ apiKey: '${key}' });`;
const context2 = `// DeepSeek API - const apiKey = '${key}'; deepseek client`;

console.log('密钥长度:', key.length);
console.log('上下文1:', context1);
console.log('上下文2:', context2);

const openaiRegex = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])|sk-(?:proj|user|svcacct)-[a-zA-Z0-9]{40,}(?![a-zA-Z0-9])/g;
const deepseekRegex = /sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])/g;

console.log('\nOpenAI 正则测试:');
openaiRegex.lastIndex = 0;
console.log('- 上下文1 匹配:', openaiRegex.test(context1));
openaiRegex.lastIndex = 0;
console.log('- 上下文2 匹配:', openaiRegex.test(context2));

console.log('\nDeepSeek 正则测试:');
deepseekRegex.lastIndex = 0;
console.log('- 上下文1 匹配:', deepseekRegex.test(context1));
deepseekRegex.lastIndex = 0;
console.log('- 上下文2 匹配:', deepseekRegex.test(context2));

console.log('\n匹配结果:');
openaiRegex.lastIndex = 0;
console.log('- OpenAI 上下文1:', context1.match(openaiRegex));
openaiRegex.lastIndex = 0;
console.log('- OpenAI 上下文2:', context2.match(openaiRegex));

deepseekRegex.lastIndex = 0;
console.log('- DeepSeek 上下文1:', context1.match(deepseekRegex));
deepseekRegex.lastIndex = 0;
console.log('- DeepSeek 上下文2:', context2.match(deepseekRegex));