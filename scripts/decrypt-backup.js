#!/usr/bin/env node

/**
 * 数据库备份解密工具
 * 用于解密 GPG 加密的数据库备份文件
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function showUsage() {
  console.log(`
用法: node scripts/decrypt-backup.js <encrypted_backup_file> [output_file]

参数:
  encrypted_backup_file  - 加密的备份文件路径 (.gz.gpg)
  output_file           - 输出文件路径 (可选，默认去掉 .gpg 扩展名)

示例:
  node scripts/decrypt-backup.js backups/database_backup_20241227_020000.json.gz.gpg
  node scripts/decrypt-backup.js backups/database_backup_20241227_020000.json.gz.gpg restored_backup.json.gz

环境变量:
  BACKUP_ENCRYPTION_PASSWORD - 备份加密密码
  
注意: 解密后的文件仍然是 gzip 压缩的，需要用 gunzip 解压
`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showUsage();
    process.exit(0);
  }
  
  const encryptedFile = args[0];
  const outputFile = args[1] || encryptedFile.replace('.gpg', '');
  
  // 检查文件是否存在
  if (!fs.existsSync(encryptedFile)) {
    console.error(`❌ 错误: 文件不存在: ${encryptedFile}`);
    process.exit(1);
  }
  
  // 检查是否设置了密码
  const password = process.env.BACKUP_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error(`❌ 错误: 请设置环境变量 BACKUP_ENCRYPTION_PASSWORD`);
    console.error(`   例如: BACKUP_ENCRYPTION_PASSWORD=your_password node scripts/decrypt-backup.js ...`);
    process.exit(1);
  }
  
  try {
    console.log(`🔓 正在解密文件: ${encryptedFile}`);
    
    // 使用 GPG 解密文件
    const command = `echo "${password}" | gpg --batch --yes --passphrase-fd 0 --decrypt --output "${outputFile}" "${encryptedFile}"`;
    execSync(command, { stdio: 'inherit' });
    
    console.log(`✅ 解密成功! 输出文件: ${outputFile}`);
    console.log(`📦 注意: 文件仍然是 gzip 压缩的，使用以下命令解压:`);
    console.log(`   gunzip "${outputFile}"`);
    
    // 显示文件信息
    const stats = fs.statSync(outputFile);
    console.log(`📊 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error(`❌ 解密失败:`, error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}