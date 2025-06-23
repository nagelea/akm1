#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file manually
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          if (key && value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    console.log('⚠️ Could not load .env file:', e.message);
  }
}

// Load environment variables
loadEnvFile();

async function quickRecoveryCheck() {
  console.log('🚨 紧急数据恢复检查...\n');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // 检查访问日志表的内容（不管列名）
    console.log('📊 检查访问日志表...');
    const { data: accessLogs, error: logsError } = await supabase
      .from('access_logs')
      .select('*')
      .limit(5);

    if (logsError) {
      console.error('❌ 查询访问日志失败:', logsError);
    } else if (accessLogs && accessLogs.length > 0) {
      console.log(`✅ 访问日志表中有 ${accessLogs.length} 条记录`);
      console.log('📋 访问日志结构和数据:');
      console.log(JSON.stringify(accessLogs[0], null, 2));
      
      // 提取 key_id 信息
      const keyIds = accessLogs.map(log => log.key_id).filter(id => id);
      const uniqueKeyIds = [...new Set(keyIds)];
      console.log(`\n🔑 从访问日志中找到 ${uniqueKeyIds.length} 个不同的 key_id:`);
      console.log(uniqueKeyIds.slice(0, 10).join(', '));
    } else {
      console.log('⚠️ 访问日志表为空');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
  }

  console.log('\n🔧 立即恢复步骤:\n');
  console.log('1. **检查 Supabase 备份 (最重要)**:');
  console.log('   - 打开 https://supabase.com/dashboard/project/' + process.env.SUPABASE_URL?.split('//')[1]?.split('.')[0]);
  console.log('   - 进入 Settings > Database');
  console.log('   - 查看 "Database backups" 选项');
  console.log('   - 如果有备份，立即恢复最近的备份');
  console.log('');
  console.log('2. **如果没有自动备份**:');
  console.log('   - 检查是否有手动导出的 SQL 文件');
  console.log('   - 联系团队其他成员是否有数据备份');
  console.log('   - 考虑重新运行扫描收集新数据');
  console.log('');
  console.log('3. **防止进一步损失**:');
  console.log('   - 暂停所有自动化脚本');
  console.log('   - 备份当前数据库状态');
  console.log('   - 修复清理脚本的安全检查');
}

// 运行检查
quickRecoveryCheck();