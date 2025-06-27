#!/usr/bin/env node

/**
 * 数据库备份恢复工具
 * 用于恢复加密的数据库备份到 Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function showUsage() {
  console.log(`
用法: node scripts/restore-backup.js <backup_file> [options]

参数:
  backup_file  - 备份文件路径 (.json, .json.gz, 或 .json.gz.gpg)

选项:
  --dry-run    - 只显示将要恢复的数据，不实际执行
  --table      - 只恢复指定的表
  --confirm    - 确认恢复操作（必需，防止误操作）

示例:
  # 恢复加密备份
  node scripts/restore-backup.js backups/database_backup_20241227_020000.json.gz.gpg --confirm
  
  # 只恢复特定表
  node scripts/restore-backup.js backup.json --table leaked_keys --confirm
  
  # 预览恢复内容
  node scripts/restore-backup.js backup.json --dry-run

环境变量:
  SUPABASE_URL              - Supabase 项目 URL
  SUPABASE_SERVICE_KEY      - Supabase 服务密钥
  BACKUP_ENCRYPTION_PASSWORD - 备份加密密码（加密文件需要）
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showUsage();
    process.exit(0);
  }
  
  const backupFile = args[0];
  const isDryRun = args.includes('--dry-run');
  const confirmRestore = args.includes('--confirm');
  const tableFilter = args.includes('--table') ? args[args.indexOf('--table') + 1] : null;
  
  if (!isDryRun && !confirmRestore) {
    console.error(`❌ 错误: 恢复操作需要 --confirm 参数确认，或使用 --dry-run 预览`);
    process.exit(1);
  }
  
  if (!fs.existsSync(backupFile)) {
    console.error(`❌ 错误: 文件不存在: ${backupFile}`);
    process.exit(1);
  }
  
  // 检查环境变量
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error(`❌ 错误: 请设置环境变量 SUPABASE_URL 和 SUPABASE_SERVICE_KEY`);
    process.exit(1);
  }
  
  let tempFile = null;
  try {
    // 处理不同格式的备份文件
    let jsonFile = backupFile;
    
    if (backupFile.endsWith('.gpg')) {
      // 解密文件
      const password = process.env.BACKUP_ENCRYPTION_PASSWORD;
      if (!password) {
        console.error(`❌ 错误: 加密文件需要设置 BACKUP_ENCRYPTION_PASSWORD`);
        process.exit(1);
      }
      
      console.log(`🔓 正在解密文件...`);
      tempFile = backupFile.replace('.gpg', '.temp');
      execSync(`echo "${password}" | gpg --batch --yes --passphrase-fd 0 --decrypt --output "${tempFile}" "${backupFile}"`);
      jsonFile = tempFile;
    }
    
    if (jsonFile.endsWith('.gz')) {
      // 解压文件
      console.log(`📦 正在解压文件...`);
      const unzippedFile = jsonFile.replace('.gz', '.temp');
      execSync(`gunzip -c "${jsonFile}" > "${unzippedFile}"`);
      if (tempFile) fs.unlinkSync(tempFile);
      tempFile = unzippedFile;
      jsonFile = unzippedFile;
    }
    
    // 读取备份数据
    console.log(`📖 正在读取备份数据...`);
    const backupData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    
    if (isDryRun) {
      console.log(`\n📋 备份文件内容预览:`);
      for (const [tableName, records] of Object.entries(backupData)) {
        if (tableFilter && tableName !== tableFilter) continue;
        console.log(`  📊 ${tableName}: ${Array.isArray(records) ? records.length : 0} 条记录`);
        if (Array.isArray(records) && records.length > 0) {
          console.log(`     示例数据:`, Object.keys(records[0]).join(', '));
        }
      }
      return;
    }
    
    // 连接数据库
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`🔄 开始恢复数据到 Supabase...`);
    
    for (const [tableName, records] of Object.entries(backupData)) {
      if (tableFilter && tableName !== tableFilter) continue;
      
      if (!Array.isArray(records) || records.length === 0) {
        console.log(`⏭️  跳过空表: ${tableName}`);
        continue;
      }
      
      console.log(`📥 正在恢复表 ${tableName} (${records.length} 条记录)...`);
      
      // 分批插入数据
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from(tableName)
          .upsert(batch, { onConflict: 'id' });
        
        if (error) {
          console.error(`❌ 恢复表 ${tableName} 失败:`, error.message);
        } else {
          console.log(`   ✅ 已恢复 ${Math.min(i + batchSize, records.length)}/${records.length} 条记录`);
        }
      }
    }
    
    console.log(`\n🎉 数据恢复完成!`);
    
  } catch (error) {
    console.error(`❌ 恢复失败:`, error.message);
    process.exit(1);
  } finally {
    // 清理临时文件
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

if (require.main === module) {
  main();
}