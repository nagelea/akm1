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

async function safeCleanupIncompleteKeys() {
  console.log('🛡️ 安全清理不完整密钥数据...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const isDryRun = process.argv.includes('--dry-run');
  const forceRun = process.argv.includes('--force');

  if (isDryRun) {
    console.log('🔍 DRY RUN 模式 - 不会实际删除任何数据\n');
  }

  try {
    // 1. 检查数据库基本状态
    console.log('📊 1. 检查数据库状态...');
    
    const { count: totalKeys, error: countError } = await supabase
      .from('leaked_keys')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ 查询总记录失败:', countError);
      return;
    }

    const { count: totalSensitive, error: sensitiveCountError } = await supabase
      .from('leaked_keys_sensitive')
      .select('key_id', { count: 'exact', head: true });

    if (sensitiveCountError) {
      console.error('❌ 查询敏感记录失败:', sensitiveCountError);
      return;
    }

    console.log(`   总密钥记录: ${totalKeys || 0} 条`);
    console.log(`   敏感数据记录: ${totalSensitive || 0} 条`);
    console.log(`   理论孤立记录: ${(totalKeys || 0) - (totalSensitive || 0)} 条\n`);

    if (totalKeys === 0) {
      console.log('⚠️ 数据库为空，无需清理');
      return;
    }

    // 2. 使用更安全的方法查找孤立记录
    console.log('🔍 2. 安全查找孤立记录...');
    
    // 首先获取所有有敏感数据的key_id
    const { data: validKeyIds, error: validError } = await supabase
      .from('leaked_keys_sensitive')
      .select('key_id');

    if (validError) {
      console.error('❌ 查询有效密钥失败:', validError);
      return;
    }

    const validIds = new Set(validKeyIds?.map(item => item.key_id) || []);
    console.log(`   找到 ${validIds.size} 个有敏感数据的密钥ID`);

    // 然后获取所有主表记录
    const { data: allKeys, error: allError } = await supabase
      .from('leaked_keys')
      .select('id, key_type, key_preview, created_at')
      .limit(5000); // 安全限制

    if (allError) {
      console.error('❌ 查询所有密钥失败:', allError);
      return;
    }

    // 找出真正的孤立记录
    const orphanedKeys = allKeys?.filter(key => !validIds.has(key.id)) || [];
    console.log(`   实际孤立记录: ${orphanedKeys.length} 条\n`);

    if (orphanedKeys.length === 0) {
      console.log('✅ 没有找到孤立记录，数据库状态良好！');
      return;
    }

    // 3. 安全检查
    console.log('🛡️ 3. 安全检查...');
    
    const orphanedPercentage = (orphanedKeys.length / totalKeys) * 100;
    console.log(`   孤立记录占比: ${orphanedPercentage.toFixed(2)}%`);

    if (orphanedPercentage > 50 && !forceRun) {
      console.error('❌ 危险: 孤立记录占比超过50%，可能存在查询逻辑错误');
      console.error('   如果确认要继续，请使用 --force 参数');
      console.error('   建议先使用 --dry-run 模式验证');
      return;
    }

    if (orphanedKeys.length > 1000 && !forceRun) {
      console.error('❌ 危险: 要删除的记录数超过1000条');
      console.error('   如果确认要继续，请使用 --force 参数');
      console.error('   建议先使用 --dry-run 模式验证');
      return;
    }

    // 4. 显示孤立记录详情
    console.log('🗂️ 4. 孤立记录详情（前10条）:');
    orphanedKeys.slice(0, 10).forEach((key, index) => {
      console.log(`   ${index + 1}. ID:${key.id} ${key.key_type} - ${key.key_preview}`);
      console.log(`      创建时间: ${new Date(key.created_at).toLocaleString()}`);
    });
    
    if (orphanedKeys.length > 10) {
      console.log(`   ... 还有 ${orphanedKeys.length - 10} 条记录\n`);
    }

    // 5. 检查访问日志依赖
    console.log('📊 5. 检查访问日志依赖...');
    const orphanedIds = orphanedKeys.map(k => k.id);
    
    const { data: accessLogs, error: logError } = await supabase
      .from('access_logs')
      .select('key_id')
      .in('key_id', orphanedIds);

    if (logError) {
      console.error('❌ 检查访问日志失败:', logError);
    } else {
      const logsCount = accessLogs?.length || 0;
      const idsWithLogs = new Set(accessLogs?.map(log => log.key_id) || []);
      console.log(`   ${idsWithLogs.size} 个孤立记录有访问日志依赖\n`);
    }

    // 6. 确认操作
    if (!isDryRun) {
      console.log('⚠️ 确认删除操作:');
      console.log(`   将删除 ${orphanedKeys.length} 条孤立记录`);
      console.log(`   这些记录没有对应的敏感数据`);
      console.log('');
      
      const shouldDelete = process.argv.includes('--delete') || process.argv.includes('--confirm');
      
      if (!shouldDelete) {
        console.log('💡 要执行删除操作，请使用以下参数之一:');
        console.log('   --delete    : 执行删除');
        console.log('   --dry-run   : 模拟运行（不删除）');
        console.log('   --force     : 强制删除（绕过安全检查）');
        console.log('');
        console.log('⚠️ 建议先运行 --dry-run 模式验证结果');
        return;
      }

      console.log('🗑️ 开始删除操作...\n');
    } else {
      console.log('🔍 DRY RUN - 模拟删除操作:\n');
    }

    // 7. 执行删除（或模拟）
    let deletedCount = 0;
    const batchSize = 50; // 小批量删除，更安全

    for (let i = 0; i < orphanedIds.length; i += batchSize) {
      const batch = orphanedIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(orphanedIds.length / batchSize);
      
      console.log(`   处理第 ${batchNum}/${totalBatches} 批 (${batch.length} 条记录)...`);

      if (!isDryRun) {
        // 先删除访问日志中的引用
        const { error: logDeleteError } = await supabase
          .from('access_logs')
          .delete()
          .in('key_id', batch);

        if (logDeleteError) {
          console.error(`   ❌ 删除访问日志失败:`, logDeleteError);
          continue;
        }

        // 再删除主记录
        const { error: keyDeleteError } = await supabase
          .from('leaked_keys')
          .delete()
          .in('id', batch);

        if (keyDeleteError) {
          console.error(`   ❌ 删除主记录失败:`, keyDeleteError);
          continue;
        }

        deletedCount += batch.length;
        console.log(`   ✅ 已删除 ${deletedCount}/${orphanedIds.length} 条记录`);
      } else {
        deletedCount += batch.length;
        console.log(`   🔍 模拟删除 ${deletedCount}/${orphanedIds.length} 条记录`);
      }

      // 安全延迟
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 8. 最终验证
    if (!isDryRun) {
      console.log('\n📊 8. 最终验证...');
      
      const { count: finalKeys } = await supabase
        .from('leaked_keys')
        .select('id', { count: 'exact', head: true });

      const { count: finalSensitive } = await supabase
        .from('leaked_keys_sensitive')
        .select('key_id', { count: 'exact', head: true });

      console.log(`   最终密钥记录: ${finalKeys || 0} 条`);
      console.log(`   最终敏感记录: ${finalSensitive || 0} 条`);
      console.log(`   数据完整性: ${finalKeys === finalSensitive ? '✅ 完整' : '❌ 不一致'}`);

      console.log('\n🎉 清理操作完成！');
      console.log(`共删除 ${deletedCount} 条不完整的密钥记录`);
    } else {
      console.log('\n🔍 DRY RUN 完成！');
      console.log(`模拟删除 ${deletedCount} 条不完整的密钥记录`);
      console.log('使用 --delete 参数执行实际删除操作');
    }

  } catch (error) {
    console.error('❌ 清理过程失败:', error.message);
  }
}

console.log('📋 安全清理工具使用说明:');
console.log('  node scripts/safe-cleanup-incomplete-keys.js --dry-run   # 模拟运行，不删除数据');
console.log('  node scripts/safe-cleanup-incomplete-keys.js --delete    # 执行删除操作');
console.log('  node scripts/safe-cleanup-incomplete-keys.js --force     # 绕过安全检查');
console.log('');

// 运行清理
safeCleanupIncompleteKeys();