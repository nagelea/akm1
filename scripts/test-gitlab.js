#!/usr/bin/env node

/**
 * 测试 GitLab 扫描器
 */

async function testGitLabScanner() {
  try {
    console.log('🔍 Testing GitLab scanner...');
    
    // 检查环境变量
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing required environment variables:');
      console.error('   SUPABASE_URL:', !!process.env.SUPABASE_URL);
      console.error('   SUPABASE_SERVICE_KEY:', !!process.env.SUPABASE_SERVICE_KEY);
      process.exit(1);
    }
    
    // 导入 GitLab 扫描器
    const GitLabScanner = require('./gitlab-scanner');
    console.log('✅ GitLab scanner imported successfully');
    
    // 创建实例
    const scanner = new GitLabScanner();
    console.log('✅ GitLab scanner instance created');
    
    // 检查方法
    if (typeof scanner.scan !== 'function') {
      console.error('❌ scanner.scan is not a function');
      console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(scanner)));
      process.exit(1);
    }
    console.log('✅ scanner.scan method exists');
    
    // 测试简单的API调用
    console.log('🌐 Testing GitLab API connectivity...');
    const testUrl = 'https://gitlab.com/api/v4/projects?per_page=1';
    const response = await fetch(testUrl);
    console.log(`GitLab API status: ${response.status}`);
    
    if (response.ok) {
      console.log('✅ GitLab API is accessible');
    } else {
      console.log('⚠️  GitLab API returned non-200 status');
    }
    
    console.log('\n🎉 GitLab scanner test completed successfully!');
    console.log('You can now run: npm run scan:gitlab');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testGitLabScanner();
}