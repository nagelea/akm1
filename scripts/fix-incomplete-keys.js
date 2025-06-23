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

async function fixIncompleteKeys() {
  console.log('🔧 修复不完整密钥数据...\n');
  
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
    // 1. 查找孤立记录（主表存在但敏感表不存在）
    console.log('📊 1. 分析孤立记录...');
    
    // 首先获取总数
    const { count: totalOrphanedCount, error: countError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        leaked_keys_sensitive!left(key_id)
      `, { count: 'exact', head: true })
      .is('leaked_keys_sensitive.key_id', null);

    if (countError) {
      console.error('❌ 统计孤立记录失败:', countError);
      return;
    }

    console.log(`   数据库中总共有 ${totalOrphanedCount || 0} 条孤立记录\n`);

    if (totalOrphanedCount === 0) {
      console.log('✅ 没有找到孤立记录，数据库状态良好！');
      return;
    }

    // 获取前1000条用于分析
    const { data: orphanedKeys, error: findError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        key_type,
        key_preview,
        created_at,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null)
      .limit(1000);

    if (findError) {
      console.error('❌ 查找孤立记录失败:', findError);
      return;
    }

    const orphanedCount = orphanedKeys?.length || 0;
    console.log(`   正在处理前 ${orphanedCount} 条孤立记录（共 ${totalOrphanedCount} 条）\n`);

    if (orphanedCount === 0) {
      console.log('✅ 没有找到孤立记录，数据库状态良好！');
      
      // 额外检查敏感数据中的空记录
      console.log('\n🔍 检查敏感数据完整性...');
      const { data: emptyKeys, error: emptyError } = await supabase
        .from('leaked_keys_sensitive')
        .select(`
          key_id,
          leaked_keys(key_type, key_preview)
        `)
        .or('full_key.is.null,full_key.eq.');

      if (emptyError) {
        console.error('❌ 检查空数据失败:', emptyError);
      } else if (emptyKeys?.length > 0) {
        console.log(`⚠️ 找到 ${emptyKeys.length} 条敏感数据记录的full_key为空`);
        console.log('这些记录也会显示"完整密钥数据未找到"');
        
        const shouldCleanEmpty = process.argv.includes('--clean-empty');
        if (shouldCleanEmpty) {
          console.log('🧹 删除空的敏感数据记录...');
          const { error: deleteEmptyError } = await supabase
            .from('leaked_keys_sensitive')
            .delete()
            .or('full_key.is.null,full_key.eq.');
          
          if (deleteEmptyError) {
            console.error('❌ 删除空记录失败:', deleteEmptyError);
          } else {
            console.log(`✅ 已删除 ${emptyKeys.length} 条空的敏感数据记录`);
          }
        } else {
          console.log('💡 使用 --clean-empty 参数来删除这些空记录');
        }
      } else {
        console.log('✅ 敏感数据完整性良好');
      }
      
      return;
    }

    // 2. 显示孤立记录详情
    console.log('🗂️ 孤立记录详情（前10条）:');
    orphanedKeys.slice(0, 10).forEach((key, index) => {
      console.log(`${index + 1}. ${key.key_type} - ${key.key_preview}`);
      console.log(`   ID: ${key.id}, 创建时间: ${new Date(key.created_at).toLocaleString()}`);
    });
    
    if (orphanedKeys.length > 10) {
      console.log(`   ... 还有 ${orphanedKeys.length - 10} 条记录\n`);
    } else {
      console.log('');
    }

    // 3. 检查是否有访问日志依赖
    console.log('📊 2. 检查访问日志依赖...');
    const orphanedIds = orphanedKeys.map(k => k.id);
    
    const { data: accessLogs, error: logError } = await supabase
      .from('access_logs')
      .select('key_id')
      .in('key_id', orphanedIds);

    if (logError) {
      console.error('❌ 检查访问日志失败:', logError);
      return;
    }

    const logsCount = accessLogs?.length || 0;
    const idsWithLogs = new Set(accessLogs?.map(log => log.key_id) || []);
    const keysWithLogs = orphanedIds.filter(id => idsWithLogs.has(id));
    const keysWithoutLogs = orphanedIds.filter(id => !idsWithLogs.has(id));

    console.log(`   ${keysWithLogs.length} 条孤立记录有访问日志依赖`);
    console.log(`   ${keysWithoutLogs.length} 条孤立记录无访问日志依赖\n`);

    // 确认操作
    const shouldDelete = process.argv.includes('--delete') || process.argv.includes('--force');
    
    if (!shouldDelete) {
      console.log('💡 要删除这些孤立记录，请使用 --delete 参数重新运行脚本');
      console.log('   npm run fix:incomplete -- --delete');
      console.log('\n⚠️ 注意事项：');
      console.log('   - 有访问日志的记录需要先删除相关日志');
      console.log('   - 删除操作不可逆');
      console.log('   - 建议先备份数据库');
      console.log(`   - 需要处理总共 ${totalOrphanedCount} 条孤立记录`);
      return;
    }

    console.log(`🗑️ 开始清理总共 ${totalOrphanedCount} 条孤立记录...`);
    console.log('   这个过程可能需要一些时间，请耐心等待\n');

    let totalDeleted = 0;
    let batchNumber = 1;

    // 循环处理所有孤立记录
    while (true) {
      console.log(`🔄 处理第 ${batchNumber} 批孤立记录...`);
      
      // 获取下一批孤立记录
      const { data: currentBatch, error: batchError } = await supabase
        .from('leaked_keys')
        .select(`
          id,
          leaked_keys_sensitive!left(key_id)
        `)
        .is('leaked_keys_sensitive.key_id', null)
        .limit(500); // 每批处理500条

      if (batchError) {
        console.error(`❌ 获取第 ${batchNumber} 批记录失败:`, batchError);
        break;
      }

      if (!currentBatch || currentBatch.length === 0) {
        console.log('✅ 所有孤立记录已处理完成');
        break;
      }

      const currentIds = currentBatch.map(k => k.id);
      console.log(`   处理 ${currentIds.length} 条记录...`);

      // 检查访问日志依赖
      const { data: currentLogs, error: logCheckError } = await supabase
        .from('access_logs')
        .select('key_id')
        .in('key_id', currentIds);

      if (logCheckError) {
        console.error(`❌ 检查访问日志失败:`, logCheckError);
        continue;
      }

      const currentLogsSet = new Set(currentLogs?.map(log => log.key_id) || []);
      const keysWithLogs = currentIds.filter(id => currentLogsSet.has(id));
      const keysWithoutLogs = currentIds.filter(id => !currentLogsSet.has(id));

      // 删除有访问日志依赖的记录
      for (const keyId of keysWithLogs) {
        try {
          // 先删除访问日志
          const { error: logDeleteError } = await supabase
            .from('access_logs')
            .delete()
            .eq('key_id', keyId);

          if (logDeleteError) {
            console.error(`   ❌ 删除访问日志失败 (key_id: ${keyId}):`, logDeleteError);
            continue;
          }

          // 再删除主记录
          const { error: keyDeleteError } = await supabase
            .from('leaked_keys')
            .delete()
            .eq('id', keyId);

          if (keyDeleteError) {
            console.error(`   ❌ 删除主记录失败 (id: ${keyId}):`, keyDeleteError);
            continue;
          }

          totalDeleted++;
        } catch (error) {
          console.error(`   ❌ 删除记录失败 (id: ${keyId}):`, error.message);
        }
      }

      // 批量删除无访问日志依赖的记录
      if (keysWithoutLogs.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < keysWithoutLogs.length; i += batchSize) {
          const batch = keysWithoutLogs.slice(i, i + batchSize);
          
          const { error: batchDeleteError } = await supabase
            .from('leaked_keys')
            .delete()
            .in('id', batch);

          if (batchDeleteError) {
            console.error(`   ❌ 批量删除失败:`, batchDeleteError);
          } else {
            totalDeleted += batch.length;
          }
        }
      }

      console.log(`   ✅ 第 ${batchNumber} 批完成，已删除 ${totalDeleted} 条记录\n`);
      batchNumber++;

      // 避免过快请求
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 6. 最终验证
    console.log('\n📊 5. 最终验证...');
    const { data: remainingOrphaned, error: verifyError } = await supabase
      .from('leaked_keys')
      .select(`
        id,
        leaked_keys_sensitive!left(key_id)
      `)
      .is('leaked_keys_sensitive.key_id', null);

    if (verifyError) {
      console.error('❌ 验证失败:', verifyError);
    } else {
      const remainingCount = remainingOrphaned?.length || 0;
      console.log(`   剩余孤立记录: ${remainingCount} 条`);
      
      if (remainingCount === 0) {
        console.log('   ✅ 所有孤立记录已清理完成！');
      }
    }

    console.log('\n🎉 修复操作完成！');
    console.log(`共删除 ${totalDeleted} 条不完整的密钥记录`);
    console.log('现在应该不再显示"完整密钥数据未找到"的问题');

  } catch (error) {
    console.error('❌ 修复过程失败:', error.message);
  }
}

console.log('📋 使用说明:');
console.log('  node scripts/fix-incomplete-keys.js                # 仅分析问题');
console.log('  node scripts/fix-incomplete-keys.js --delete       # 删除孤立记录');
console.log('  node scripts/fix-incomplete-keys.js --clean-empty  # 清理空敏感数据');
console.log('');

// 运行修复
fixIncompleteKeys();