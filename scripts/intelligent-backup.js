#!/usr/bin/env node

/**
 * 智能数据库备份工具
 * 自动发现所有用户表并进行完整备份
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function intelligentBackup() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const backupFile = process.argv[2] || `intelligent_backup_${Date.now()}.json`;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    console.log('🔍 自动发现数据库表结构...');
    
    // 查询数据库中的所有用户表
    const { data: tableList, error: tablesError } = await supabase
      .rpc('get_user_tables', {});
    
    let tables;
    if (tablesError || !tableList) {
      console.log('⚠️  无法自动发现表，使用预定义列表');
      // 回退到预定义的表列表
      tables = ['leaked_keys', 'leaked_keys_sensitive', 'admin_users', 'access_logs', 'daily_stats'];
    } else {
      tables = tableList.map(t => t.table_name);
      console.log(`📊 发现 ${tables.length} 个用户表:`, tables.join(', '));
    }
    
    const backup = {};
    let totalRecords = 0;
    
    console.log('\n📦 开始备份数据...');
    
    for (const table of tables) {
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact' });
        
        if (error) {
          console.log(`❌ ${table}: ${error.message}`);
          backup[table] = {
            error: error.message,
            data: []
          };
        } else {
          const records = data || [];
          backup[table] = records;
          totalRecords += records.length;
          console.log(`✅ ${table}: ${records.length} 条记录`);
        }
      } catch (err) {
        console.log(`❌ ${table}: ${err.message}`);
        backup[table] = {
          error: err.message,
          data: []
        };
      }
    }
    
    // 添加详细的元数据
    backup._metadata = {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      backup_type: 'intelligent_full',
      database_url: supabaseUrl.replace(/\/\/.*@/, '//***@'), // 隐藏凭证
      tables_discovered: tables,
      total_records: totalRecords,
      successful_tables: tables.filter(t => !backup[t].error && Array.isArray(backup[t])),
      failed_tables: tables.filter(t => backup[t].error),
      schema_info: {
        discovery_method: tableList ? 'automatic' : 'predefined',
        table_count: tables.length
      }
    };
    
    console.log(`\n📊 备份完成摘要:`);
    console.log(`   总记录数: ${totalRecords}`);
    console.log(`   成功备份表: ${backup._metadata.successful_tables.length}`);
    console.log(`   失败表: ${backup._metadata.failed_tables.length}`);
    if (backup._metadata.failed_tables.length > 0) {
      console.log(`   失败表列表: ${backup._metadata.failed_tables.join(', ')}`);
    }
    
    // 保存备份文件
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    const stats = fs.statSync(backupFile);
    
    console.log(`\n💾 备份已保存:`);
    console.log(`   文件: ${backupFile}`);
    console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   时间: ${backup._metadata.timestamp}`);
    
    return backup;
    
  } catch (error) {
    console.error('❌ 智能备份失败:', error.message);
    process.exit(1);
  }
}

// 创建获取用户表的SQL函数（需要在Supabase中执行一次）
const CREATE_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION get_user_tables()
RETURNS TABLE(table_name text, table_schema text, table_type text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    t.table_name::text,
    t.table_schema::text,
    t.table_type::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT LIKE 'sql_%'
  ORDER BY t.table_name;
$$;
`;

if (require.main === module) {
  intelligentBackup();
}

module.exports = { intelligentBackup, CREATE_FUNCTION_SQL };