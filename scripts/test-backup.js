#!/usr/bin/env node

/**
 * 测试数据库备份功能
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testBackup() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    console.log('🔍 测试数据库连接和表结构...');
    
    // 尝试自动发现表
    let tables;
    try {
      const { data: discoveredTables, error } = await supabase.rpc('get_user_tables');
      if (error || !discoveredTables) {
        throw new Error('自动发现失败');
      }
      tables = discoveredTables.map(t => t.table_name);
      console.log(`✅ 自动发现 ${tables.length} 个表:`, tables.join(', '));
    } catch (err) {
      console.log('⚠️  自动发现失败，使用预定义列表:', err.message);
      tables = ['leaked_keys', 'leaked_keys_sensitive', 'admin_users', 'access_logs', 'daily_stats', 'visitor_stats', 'online_users'];
    }
    const backup = {};
    
    for (const table of tables) {
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact' });
        
        if (error) {
          console.log(`❌ ${table}: ${error.message}`);
          backup[table] = [];
        } else {
          backup[table] = data || [];
          console.log(`✅ ${table}: ${(data || []).length} 条记录`);
        }
      } catch (err) {
        console.log(`❌ ${table}: ${err.message}`);
        backup[table] = [];
      }
    }
    
    // 添加元数据
    backup._metadata = {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      tables: Object.keys(backup).filter(k => k !== '_metadata'),
      total_records: Object.values(backup).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
    };
    
    console.log(`\n📊 备份摘要:`);
    console.log(`   总记录数: ${backup._metadata.total_records}`);
    console.log(`   表数量: ${backup._metadata.tables.length}`);
    console.log(`   时间戳: ${backup._metadata.timestamp}`);
    
    // 创建测试备份文件
    const testFile = `test_backup_${Date.now()}.json`;
    fs.writeFileSync(testFile, JSON.stringify(backup, null, 2));
    console.log(`\n💾 测试备份已保存: ${testFile}`);
    
    // 显示文件大小
    const stats = fs.statSync(testFile);
    console.log(`📁 文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // 清理测试文件
    fs.unlinkSync(testFile);
    console.log(`🧹 测试文件已清理`);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testBackup();
}