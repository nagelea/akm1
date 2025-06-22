// 修复扫描器搜索逻辑的问题诊断和修复

console.log('=== GitHub API Key Scanner 诊断 ===');

// 问题1: 日期过滤逻辑错误
const today = new Date().toISOString().split('T')[0];
console.log('今天日期:', today);
console.log('当前搜索:', `created:>${today}`);
console.log('问题: 这只会搜索今天创建的仓库，而不是今天修改的文件');

// 修复方案
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
console.log('修复后搜索1:', `pushed:>${yesterday}`);
console.log('修复后搜索2:', `"sk-" NOT is:fork`); // 排除fork仓库
console.log('修复后搜索3:', `"sk-" language:python size:>0`); // 确保有内容

// 问题2: 搜索词可能过于严格
console.log('\n=== 当前搜索策略分析 ===');
const currentQueries = [
  `"sk-" created:>${today}`,
  `"sk-ant-" created:>${today}`,
  `"AIza" created:>${today}`,
];

console.log('当前查询:', currentQueries);
console.log('问题: created: 过滤器限制太严格');

// 建议的新搜索策略
const newQueries = [
  // 移除日期限制，使用更宽松的搜索
  '"sk-" language:python NOT is:fork',
  '"sk-" language:javascript NOT is:fork', 
  '"AIza" language:python NOT is:fork',
  '"hf_" language:python NOT is:fork',
  'openai_api_key language:python',
  'anthropic_api_key language:python',
  // 添加最近活跃的仓库
  `"sk-" pushed:>${yesterday} NOT is:fork`,
  `"AIza" pushed:>${yesterday} NOT is:fork`
];

console.log('建议的新查询:', newQueries);

console.log('\n=== 环境变量检查 ===');
console.log('GITHUB_TOKEN 长度:', (process.env.GITHUB_TOKEN || '').length);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '已设置' : '未设置');
console.log('SUPABASE_SERVICE_KEY 长度:', (process.env.SUPABASE_SERVICE_KEY || '').length);

console.log('\n=== 建议修复步骤 ===');
console.log('1. 修改日期过滤逻辑');
console.log('2. 使用更宽松的搜索条件');  
console.log('3. 添加调试日志');
console.log('4. 测试单个查询');