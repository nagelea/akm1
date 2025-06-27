# 数据库备份完整性指南

## 📊 数据库表结构

根据 `database-simple.sql`，系统包含以下所有表：

### 🔍 核心数据表
| 表名 | 用途 | 备份状态 | 重要性 |
|------|------|----------|--------|
| `leaked_keys` | 公开密钥信息 | ✅ 已备份 | 高 |
| `leaked_keys_sensitive` | 完整密钥数据 | ✅ 已备份 | 极高 |
| `admin_users` | 管理员账户 | ✅ 已备份 | 高 |
| `access_logs` | 操作审计日志 | ✅ 已备份 | 中 |
| `daily_stats` | 每日统计数据 | ✅ 已备份 | 中 |

### 📈 新增表（可选）
| 表名 | 用途 | 备份状态 | 重要性 |
|------|------|----------|--------|
| `backup_history` | 备份历史记录 | 🔄 自动检测 | 低 |

### 🔍 数据库对象
| 对象类型 | 名称 | 备份方式 |
|----------|------|----------|
| 视图 | `recent_keys` | 📄 不备份（可重建） |
| 视图 | `stats_summary` | 📄 不备份（可重建） |
| 视图 | `backup_stats` | 📄 不备份（可重建） |
| 函数 | `get_user_tables()` | 📄 脚本重建 |
| 触发器 | `update_*_updated_at` | 📄 脚本重建 |
| 索引 | 各种索引 | 📄 脚本重建 |
| RLS策略 | 权限控制 | 📄 脚本重建 |

## 🔧 备份方法对比

### 1. 标准备份（GitHub Actions）
```yaml
# .github/workflows/database-backup.yml
tables: ['leaked_keys', 'leaked_keys_sensitive', 'admin_users', 'access_logs', 'daily_stats']
```
- ✅ 覆盖所有核心表
- ✅ 自动加密
- ✅ 定时执行
- ❌ 固定表列表

### 2. 智能备份（推荐）
```bash
npm run backup:intelligent
```
- ✅ 自动发现所有表
- ✅ 包含表统计信息
- ✅ 错误容错处理
- ✅ 详细备份报告
- ❌ 需要额外设置

### 3. 测试备份
```bash
npm run test:backup
```
- ✅ 验证连接性
- ✅ 检查表存在性
- ✅ 统计记录数量
- ❌ 不生成实际备份

## 📋 备份完整性检查清单

### ✅ 当前备份状态
- [x] `leaked_keys` - 核心密钥数据
- [x] `leaked_keys_sensitive` - 完整密钥（加密存储）
- [x] `admin_users` - 管理员账户
- [x] `access_logs` - 审计日志
- [x] `daily_stats` - 统计数据

### 🔄 自动化检查
```bash
# 验证备份完整性
npm run test:backup

# 生成智能备份
npm run backup:intelligent

# 检查表结构变化
npm run backup:intelligent | grep "发现.*个表"
```

## 🚀 设置智能备份

### 1. 执行数据库函数设置
在 Supabase SQL 编辑器中执行：
```sql
-- 复制并执行 setup-backup-functions.sql 中的内容
```

### 2. 验证函数可用性
```bash
npm run test:backup
```

### 3. 更新 GitHub Actions（可选）
```yaml
# 在 .github/workflows/database-backup.yml 中替换：
node backup_script.js "$BACKUP_FILE"
# 为：
node scripts/intelligent-backup.js "$BACKUP_FILE"
```

## 📊 备份数据结构

### 标准备份格式
```json
{
  "leaked_keys": [...],
  "leaked_keys_sensitive": [...],
  "admin_users": [...],
  "access_logs": [...],
  "daily_stats": [...],
  "_metadata": {
    "timestamp": "2024-12-27T04:21:21.000Z",
    "version": "2.0.0",
    "tables": ["leaked_keys", "..."],
    "total_records": 1234
  }
}
```

### 智能备份格式
```json
{
  "table_name": [...],
  "_metadata": {
    "backup_type": "intelligent_full",
    "tables_discovered": ["..."],
    "successful_tables": ["..."],
    "failed_tables": ["..."],
    "schema_info": {
      "discovery_method": "automatic",
      "table_count": 5
    }
  }
}
```

## ⚠️ 注意事项

### 数据安全
- 🔒 敏感表 (`leaked_keys_sensitive`) 包含完整API密钥
- 🔒 管理员表 (`admin_users`) 包含密码哈希
- 🔒 所有备份都应加密存储

### 备份策略
- 📅 每日自动备份（GitHub Actions）
- 💾 本地保留7天加密备份
- 🔄 智能备份用于完整性验证
- 📊 备份历史记录可选跟踪

### 恢复考虑
- 🔧 结构恢复：先执行 `database-simple.sql`
- 📊 数据恢复：使用 `npm run restore:backup`
- ⚡ 部分恢复：支持单表恢复
- 🔍 验证恢复：使用 `npm run test:backup`

## 🛠️ 故障排除

### 表不存在错误
```
Error backing up table_name: relation "public.table_name" does not exist
```
**解决方案**：
1. 检查 `database-simple.sql` 是否已执行
2. 验证表名拼写
3. 确认RLS策略允许访问

### 权限错误
```
Error: insufficient_privilege
```
**解决方案**：
1. 确认使用 `SUPABASE_SERVICE_KEY`
2. 检查RLS策略配置
3. 验证服务角色权限

### 空备份文件
```
Backup saved but contains no data
```
**解决方案**：
1. 运行 `npm run test:backup` 诊断
2. 检查表中是否有数据
3. 验证Supabase连接