// 测试GitHub扫描器是否工作
const { Octokit } = require('@octokit/rest');

async function testScanner() {
  console.log('🔍 Testing GitHub API Key Scanner...');
  
  // 检查环境变量
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('❌ GITHUB_TOKEN not found');
    process.exit(1);
  }
  
  console.log('✅ GitHub Token found:', token.substring(0, 10) + '***');
  
  const octokit = new Octokit({ auth: token });
  
  // 测试查询
  const testQueries = [
    '"sk-" language:python NOT is:fork',
    '"AIza" language:python NOT is:fork',
    '"hf_" language:python NOT is:fork'
  ];
  
  for (const query of testQueries) {
    try {
      console.log(`\n🔎 Testing query: ${query}`);
      
      const results = await octokit.rest.search.code({
        q: query,
        per_page: 5
      });
      
      console.log(`📄 Found ${results.data.items.length} files (total: ${results.data.total_count})`);
      
      if (results.data.items.length > 0) {
        console.log('✅ Sample results:');
        results.data.items.slice(0, 2).forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.repository.full_name}/${item.path}`);
        });
      } else {
        console.log('⚠️  No results found');
      }
      
      // 等待避免API限制
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Query failed: ${error.message}`);
      if (error.status === 403) {
        console.log('⏳ Rate limited, waiting...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }
  
  console.log('\n✅ Scanner test completed!');
}

// 运行测试
if (require.main === module) {
  testScanner().catch(console.error);
}