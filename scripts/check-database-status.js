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

async function checkDatabaseStatus() {
  console.log('📊 检查数据库状态...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // 检查主表记录数
    const { count: mainKeysCount, error: mainError } = await supabase
      .from('leaked_keys')
      .select('id', { count: 'exact', head: true });

    if (mainError) {
      console.error('❌ 查询主表失败:', mainError);
      return;
    }

    // 检查敏感数据表记录数
    const { count: sensitiveKeysCount, error: sensitiveError } = await supabase
      .from('leaked_keys_sensitive')
      .select('key_id', { count: 'exact', head: true });

    if (sensitiveError) {
      console.error('❌ 查询敏感表失败:', sensitiveError);
      return;
    }

    // 检查访问日志数
    const { count: accessLogsCount, error: logsError } = await supabase
      .from('access_logs')
      .select('id', { count: 'exact', head: true });

    if (logsError) {
      console.error('❌ 查询访问日志失败:', logsError);
    }

    console.log('📊 数据库当前状态:');
    console.log(`   主密钥表 (leaked_keys): ${mainKeysCount || 0} 条记录`);
    console.log(`   敏感数据表 (leaked_keys_sensitive): ${sensitiveKeysCount || 0} 条记录`);
    console.log(`   访问日志表 (access_logs): ${accessLogsCount || 0} 条记录`);
    console.log(`   数据完整性: ${mainKeysCount === sensitiveKeysCount ? '✅ 完整' : '❌ 不一致'}`);

    if (mainKeysCount === 0) {
      console.log('\n⚠️ 警告: 主密钥表为空！所有数据可能已被误删。');
      console.log('\n🔍 可能的恢复方案:');
      console.log('   1. 从 Supabase 备份恢复（如果有的话）');
      console.log('   2. 检查是否有数据库快照');
      console.log('   3. 重新运行扫描来重新收集数据');
      console.log('   4. 检查 Supabase 的历史记录/版本控制');
    } else {
      console.log('\n✅ 数据库中仍有有效记录');
      
      // 显示最近的几条记录
      const { data: recentKeys, error: recentError } = await supabase
        .from('leaked_keys')
        .select('id, key_type, key_preview, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!recentError && recentKeys?.length > 0) {
        console.log('\n📋 最近的密钥记录:');
        recentKeys.forEach((key, index) => {
          console.log(`   ${index + 1}. ${key.key_type} - ${key.key_preview}`);
          console.log(`      ID: ${key.id}, 创建时间: ${new Date(key.created_at).toLocaleString()}`);
        });
      }
    }

    // 检查是否有孤立记录
    const { data: orphanedKeys, error: orphanError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null)
      .limit(5);

    if (!orphanError) {
      const orphanCount = orphanedKeys?.length || 0;
      if (orphanCount > 0) {
        console.log(`\n⚠️ 发现 ${orphanCount} 条孤立记录（可能还有更多）`);
      }
    }

  } catch (error) {
    console.error('❌ 检查过程失败:', error.message);
  }
}

// 运行检查
checkDatabaseStatus();