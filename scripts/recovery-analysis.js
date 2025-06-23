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
      console.log('✅ Loaded environment variables from .env file');
    }
  } catch (e) {
    console.log('⚠️ Could not load .env file:', e.message);
  }
}

// Load environment variables
loadEnvFile();

async function analyzeRecoveryOptions() {
  console.log('🔍 分析数据恢复选项...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // 分析访问日志中的信息
    console.log('📊 分析访问日志...');
    const { data: accessLogs, error: logsError } = await supabase
      .from('access_logs')
      .select('*')
      .order('accessed_at', { ascending: false })
      .limit(20);

    if (logsError) {
      console.error('❌ 查询访问日志失败:', logsError);
    } else {
      console.log(`   找到 ${accessLogs?.length || 0} 条访问日志记录`);
      
      if (accessLogs && accessLogs.length > 0) {
        console.log('\n📋 最近的访问记录:');
        accessLogs.slice(0, 5).forEach((log, index) => {
          console.log(`   ${index + 1}. Key ID: ${log.key_id}`);
          console.log(`      User ID: ${log.user_id}`);
          console.log(`      访问时间: ${new Date(log.accessed_at).toLocaleString()}`);
          console.log(`      操作: ${log.action || 'N/A'}`);
        });

        // 获取被删除的key_id列表
        const deletedKeyIds = [...new Set(accessLogs.map(log => log.key_id))];
        console.log(`\n🔑 从访问日志中发现 ${deletedKeyIds.length} 个不同的 key_id 被删除了`);
        console.log(`   Key IDs: ${deletedKeyIds.slice(0, 10).join(', ')}${deletedKeyIds.length > 10 ? '...' : ''}`);
      }
    }

    // 检查日常统计表
    console.log('\n📊 检查日常统计数据...');
    const { data: dailyStats, error: statsError } = await supabase
      .from('daily_stats')
      .select('*')
      .order('date', { ascending: false })
      .limit(10);

    if (statsError) {
      console.error('❌ 查询日常统计失败:', statsError);
    } else {
      console.log(`   找到 ${dailyStats?.length || 0} 条统计记录`);
      
      if (dailyStats && dailyStats.length > 0) {
        console.log('\n📈 最近的统计数据:');
        dailyStats.slice(0, 3).forEach((stat, index) => {
          console.log(`   ${index + 1}. 日期: ${stat.date}`);
          console.log(`      总密钥数: ${stat.total_keys || 0}`);
          console.log(`      今日新增: ${stat.keys_found || 0}`);
          console.log(`      高危密钥: ${stat.high_severity_keys || 0}`);
        });
      }
    }

    // 恢复建议
    console.log('\n🔧 恢复建议:\n');
    
    console.log('1. **立即检查 Supabase 备份**:');
    console.log('   - 登录 Supabase Dashboard');
    console.log('   - 进入项目设置 > Database');
    console.log('   - 查看是否有自动备份可以恢复');
    console.log('');
    
    console.log('2. **检查 Supabase 历史版本**:');
    console.log('   - 在 Supabase Dashboard 查看 Table Editor');
    console.log('   - 某些操作可能有撤销选项');
    console.log('');
    
    console.log('3. **重新扫描收集数据**:');
    console.log('   - 虽然不是原始数据，但可以重新开始收集');
    console.log('   - 运行: npm run scan');
    console.log('');
    
    console.log('4. **检查是否有其他数据源**:');
    console.log('   - 查看是否有数据库导出文件');
    console.log('   - 检查本地开发环境是否有备份');
    console.log('');

    console.log('⚠️ **紧急行动项**:');
    console.log('   1. 立即停止任何自动扫描，防止覆盖恢复点');
    console.log('   2. 检查 Supabase 的备份和恢复选项');
    console.log('   3. 如果有备份，优先考虑从备份恢复');
    console.log('   4. 记录这次事件，更新清理脚本的安全检查');

  } catch (error) {
    console.error('❌ 分析过程失败:', error.message);
  }
}

// 运行分析
analyzeRecoveryOptions();