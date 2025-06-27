# 数据库备份安全文档

## 概述

为了保护敏感的API密钥数据，本系统实现了加密的数据库备份机制。备份文件使用 GPG 对称加密（AES256）进行保护。

## 加密机制

### 加密流程
1. **数据导出**: 从 Supabase 导出数据为 JSON 格式
2. **压缩**: 使用 gzip 压缩数据以减少存储空间
3. **加密**: 使用 GPG AES256 对称加密保护数据
4. **存储**: 将加密文件提交到 Git 仓库

### 加密算法
- **对称加密**: GPG 对称加密
- **加密算法**: AES256
- **文件格式**: `.json.gz.gpg`

## 配置设置

### GitHub Secrets 配置

在 GitHub 仓库的 Settings > Secrets 中添加：

```
BACKUP_ENCRYPTION_PASSWORD=your_strong_password_here
```

**重要**: 
- 使用强密码（至少 16 位，包含大小写字母、数字、特殊字符）
- 妥善保管密码，丢失密码将无法恢复备份
- 建议使用密码管理器生成和存储密码

### 环境变量示例

```bash
# 生产环境
export BACKUP_ENCRYPTION_PASSWORD="Xy9$mK8#vL2@nP4&qR7%wE1!"

# 开发环境
export BACKUP_ENCRYPTION_PASSWORD="dev_password_2024"
```

## 使用方法

### 自动备份

GitHub Actions 会自动执行加密备份：
- **频率**: 每天凌晨 2:00
- **保留期**: 7 天
- **文件格式**: `database_backup_YYYYMMDD_HHMMSS.json.gz.gpg`

### 手动解密备份

```bash
# 解密备份文件
BACKUP_ENCRYPTION_PASSWORD=your_password npm run decrypt:backup backups/database_backup_20241227_020000.json.gz.gpg

# 解压得到 JSON 文件
gunzip database_backup_20241227_020000.json.gz
```

### 恢复备份到数据库

```bash
# 预览备份内容
BACKUP_ENCRYPTION_PASSWORD=your_password npm run restore:backup backups/database_backup_20241227_020000.json.gz.gpg --dry-run

# 恢复完整备份
BACKUP_ENCRYPTION_PASSWORD=your_password npm run restore:backup backups/database_backup_20241227_020000.json.gz.gpg --confirm

# 只恢复特定表
BACKUP_ENCRYPTION_PASSWORD=your_password npm run restore:backup backup.json --table leaked_keys --confirm
```

## 安全最佳实践

### 密码管理
1. **使用强密码**: 至少 16 位字符，包含多种字符类型
2. **定期更换**: 建议每年更换一次加密密码
3. **安全存储**: 使用密码管理器，不要存储在代码中
4. **备份密码**: 在安全的地方备份密码

### 访问控制
1. **限制访问**: 只有必要的团队成员才能访问加密密码
2. **审计日志**: 记录谁在何时访问了备份
3. **权限分离**: 备份解密权限与生产环境权限分离

### 文件安全
1. **传输安全**: 通过 HTTPS 传输加密文件
2. **存储安全**: 加密文件存储在私有仓库中
3. **清理临时文件**: 解密后及时清理临时文件

## 故障排除

### 常见问题

#### 1. 解密失败
```
❌ 解密失败: gpg: decryption failed: Bad session key
```
**解决方案**: 检查密码是否正确

#### 2. GPG 命令不存在
```
❌ 错误: gpg: command not found
```
**解决方案**: 安装 GPG
```bash
# Ubuntu/Debian
sudo apt-get install gnupg

# macOS
brew install gnupg

# CentOS/RHEL
sudo yum install gnupg2
```

#### 3. 权限错误
```
❌ 错误: Permission denied
```
**解决方案**: 检查文件权限
```bash
chmod +x scripts/decrypt-backup.js
chmod +x scripts/restore-backup.js
```

### 应急恢复

如果密码丢失：
1. **检查密码管理器**: 确认是否有备份密码
2. **检查团队成员**: 其他管理员是否有密码副本
3. **重新配置**: 最后手段是重新配置加密密码（需要重新备份）

## 合规性考虑

### 数据保护
- 备份数据包含敏感的 API 密钥信息
- 加密确保数据在传输和存储过程中的安全性
- 符合数据保护法规要求

### 审计要求
- 记录备份创建时间和操作人员
- 监控备份文件的访问情况
- 定期检查加密机制的有效性

## 更新日志

- **2024-12-27**: 初始实现 GPG AES256 加密
- **2024-12-27**: 添加解密和恢复工具
- **2024-12-27**: 完善文档和最佳实践指南