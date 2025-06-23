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

async function cleanupIncompleteKeys() {
  console.log('🧹 Cleaning up incomplete key records...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    console.error('\n📝 Please create a .env file in the project root with:');
    console.error('   SUPABASE_URL=https://your-project.supabase.co');
    console.error('   SUPABASE_SERVICE_KEY=your_service_key_here');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    console.log('🔍 查找孤立的主记录（没有对应敏感数据）...');
    
    // 查找没有对应敏感数据的主记录
    const { data: orphanedKeys, error: orphanError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        key_type,
        key_preview,
        repo_name,
        file_path,
        created_at,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null);

    if (orphanError) {
      console.error('❌ 查询孤立记录失败:', orphanError);
      return;
    }

    console.log(`📊 找到 ${orphanedKeys.length} 条孤立记录\n`);

    if (orphanedKeys.length === 0) {
      console.log('✅ 没有找到孤立记录，数据库状态良好！');
      
      // 额外检查：查找敏感数据中full_key为空的记录
      console.log('\n🔍 检查敏感数据表中的空full_key记录...');
      
      const { data: emptyKeys, error: emptyError } = await supabase
        .from('leaked_keys_sensitive')
        .select(`
          key_id,
          leaked_keys(key_type, key_preview, repo_name)
        `)
        .or('full_key.is.null,full_key.eq.');

      if (emptyError) {
        console.error('❌ 查询空full_key记录失败:', emptyError);
        return;
      }

      if (emptyKeys.length > 0) {
        console.log(`⚠️ 找到 ${emptyKeys.length} 条敏感数据记录的full_key为空`);
        console.log('这些记录也会显示"完整密钥数据未找到"');
        
        // 可选：删除这些无效的敏感数据记录
        const shouldCleanEmpty = process.argv.includes('--clean-empty');
        if (shouldCleanEmpty) {
          const keyIds = emptyKeys.map(k => k.key_id);
          const { error: deleteError } = await supabase
            .from('leaked_keys')
            .delete()
            .in('id', keyIds);
          
          if (deleteError) {
            console.error('❌ 删除空密钥记录失败:', deleteError);
          } else {
            console.log(`✅ 已删除 ${emptyKeys.length} 条空密钥记录`);
          }
        } else {
          console.log('💡 使用 --clean-empty 参数来删除这些记录');
        }
      } else {
        console.log('✅ 敏感数据表状态良好，没有空的full_key记录');
      }
      
      return;
    }

    // 显示孤立记录的详细信息
    console.log('🗂️ 孤立记录详情:');
    orphanedKeys.forEach((key, index) => {
      console.log(`${index + 1}. ${key.key_type} - ${key.key_preview}`);
      console.log(`   文件: ${key.repo_name}/${key.file_path}`);
      console.log(`   创建时间: ${new Date(key.created_at).toLocaleString()}`);
      console.log('');
    });

    // 询问是否删除这些孤立记录
    const shouldDelete = process.argv.includes('--delete') || process.argv.includes('--force');
    
    if (!shouldDelete) {
      console.log('💡 要删除这些孤立记录，请使用 --delete 参数重新运行脚本');
      console.log('   npm run clean:incomplete -- --delete');
      console.log('\n⚠️ 删除操作不可逆，请确认这些记录确实是不完整的');
      return;
    }

    console.log('🗑️ 删除孤立记录（分批处理）...');
    
    const keyIds = orphanedKeys.map(key => key.id);
    const batchSize = 100; // 每批删除100条
    let deletedCount = 0;
    
    for (let i = 0; i < keyIds.length; i += batchSize) {
      const batch = keyIds.slice(i, i + batchSize);
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
      console.log(`   ✅ 已删除 ${deletedCount} / ${keyIds.length} 条记录`);
      
      // 避免数据库压力，稍作延迟
      if (i + batchSize < keyIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ 删除操作完成，共删除 ${deletedCount} 条孤立记录`);
    
    // 再次检查确认清理完成
    const { data: remainingOrphans } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null);

    console.log(`\n📊 清理后剩余孤立记录: ${remainingOrphans?.length || 0} 条`);
    
    if (remainingOrphans?.length === 0) {
      console.log('🎉 数据库清理完成！不再有"完整密钥数据未找到"的记录');
    }

  } catch (error) {
    console.error('❌ 清理过程失败:', error.message);
  }
}

console.log('📋 使用说明:');
console.log('  node scripts/cleanup-incomplete-keys.js          # 仅查看孤立记录');
console.log('  node scripts/cleanup-incomplete-keys.js --delete # 删除孤立记录');
console.log('  node scripts/cleanup-incomplete-keys.js --clean-empty # 删除空密钥记录');
console.log('');

// 运行清理
cleanupIncompleteKeys();