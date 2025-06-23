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
    } else {
      console.log('⚠️ .env file not found, using system environment variables');
    }
  } catch (e) {
    console.log('⚠️ Could not load .env file:', e.message);
  }
}

// Load environment variables
loadEnvFile();

async function runSQLCleanup() {
  console.log('🧹 执行SQL清理脚本...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // 1. 统计孤立记录数量
    console.log('📊 1. 统计孤立记录...');
    const { data: orphanedKeys, error: countError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null);

    if (countError) {
      console.error('❌ 统计查询失败:', countError);
      return;
    }

    const orphanedCount = orphanedKeys?.length || 0;
    console.log(`   找到 ${orphanedCount} 条孤立记录\n`);

    if (orphanedCount === 0) {
      console.log('✅ 没有找到孤立记录，数据库状态良好！');
      return;
    }

    // 确认删除操作
    const shouldDelete = process.argv.includes('--delete') || process.argv.includes('--force');
    
    if (!shouldDelete) {
      console.log('💡 要删除这些孤立记录，请使用 --delete 参数重新运行脚本');
      console.log('   npm run sql:cleanup -- --delete');
      console.log('\n⚠️ 删除操作不可逆，请确认这些记录确实是不完整的');
      return;
    }

    // 2. 删除孤立记录
    console.log(`🗑️ 2. 删除 ${orphanedCount} 条孤立记录...`);
    
    const orphanedIds = orphanedKeys.map(key => key.id);
    const batchSize = 1000;
    let deletedCount = 0;

    for (let i = 0; i < orphanedIds.length; i += batchSize) {
      const batch = orphanedIds.slice(i, i + batchSize);
      console.log(`   正在删除第 ${Math.floor(i/batchSize) + 1} 批，共 ${batch.length} 条记录...`);
      
      const { error: deleteError } = await supabase
        .from('leaked_keys')
        .delete()
        .in('id', batch);

      if (deleteError) {
        console.error(`❌ 第 ${Math.floor(i/batchSize) + 1} 批删除失败:`, deleteError);
        break;
      }
      
      deletedCount += batch.length;
      console.log(`   ✅ 已删除 ${deletedCount} / ${orphanedIds.length} 条记录`);
      
      // 避免数据库压力，稍作延迟
      if (i + batchSize < orphanedIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`   ✅ 孤立记录删除完成，共删除 ${deletedCount} 条记录\n`);

    // 3. 验证清理结果
    console.log('📊 3. 验证清理结果...');
    const { data: remainingOrphaned, error: verifyError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null);

    if (verifyError) {
      console.error('❌ 验证查询失败:', verifyError);
    } else {
      const remainingCount = remainingOrphaned?.length || 0;
      console.log(`   剩余孤立记录: ${remainingCount} 条\n`);
    }

    // 4. 清理敏感数据表中的空记录
    console.log('🧹 4. 清理敏感数据表中的空记录...');
    const { error: cleanSensitiveError } = await supabase
      .from('leaked_keys_sensitive')
      .delete()
      .or('full_key.is.null,full_key.eq.');

    if (cleanSensitiveError) {
      console.error('❌ 清理敏感数据失败:', cleanSensitiveError);
    } else {
      console.log('   ✅ 敏感数据清理完成\n');
    }

    // 5. 最终统计
    console.log('📊 5. 最终统计...');
    
    const { count: totalMainKeys, error: mainError } = await supabase
      .from('leaked_keys')
      .select('id', { count: 'exact', head: true });
    
    const { count: totalSensitiveKeys, error: sensitiveError } = await supabase
      .from('leaked_keys_sensitive')
      .select('key_id', { count: 'exact', head: true });

    if (mainError || sensitiveError) {
      console.error('❌ 统计查询失败');
    } else {
      console.log(`   总主键数量: ${totalMainKeys || 0}`);
      console.log(`   总敏感数据数量: ${totalSensitiveKeys || 0}`);
      console.log(`   数据完整性差异: ${(totalMainKeys || 0) - (totalSensitiveKeys || 0)}`);
      
      if (totalMainKeys === totalSensitiveKeys) {
        console.log('   ✅ 数据完整性良好，所有主键都有对应的敏感数据');
      }
    }

    console.log('\n🎉 SQL清理操作完成！');
    console.log('现在所有密钥记录都应该有完整的敏感数据，不再显示"完整密钥数据未找到"');

  } catch (error) {
    console.error('❌ SQL清理过程失败:', error.message);
  }
}

console.log('📋 使用说明:');
console.log('  node scripts/run-sql-cleanup.js          # 仅查看统计信息');
console.log('  node scripts/run-sql-cleanup.js --delete # 执行清理操作');
console.log('');

// 运行清理
runSQLCleanup();