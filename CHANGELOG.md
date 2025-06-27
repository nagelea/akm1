# 更新日志

## v2.0.0 - 清理整理版 (2024-12-27)

### 🧹 项目结构优化
- **重新整理项目结构**：将开发过程中的临时文件移动到 `archived/` 文件夹
- **简化脚本命令**：只保留核心功能的 npm 脚本，移除过时的分析脚本
- **文档整理**：归档过时文档，保留核心使用文档

### 📁 文件夹结构
```
/
├── app/                    # Next.js 应用主体
├── scripts/                # 核心脚本 (只保留必要功能)
│   ├── scanner.js         # GitHub 扫描器
│   ├── export-keys.js     # 密钥导出工具
│   ├── decrypt-backup.js  # 备份解密工具
│   ├── restore-backup.js  # 备份恢复工具
│   └── extract-keys.js    # 手动密钥提取
├── lib/                   # 工具库
├── archived/              # 历史文件归档
│   ├── sql/              # 临时 SQL 脚本
│   ├── scripts/          # 分析和清理脚本
│   ├── docs/             # 过时文档
│   ├── reports/          # 分析报告
│   └── tests/            # 测试文件
├── database-simple.sql   # 数据库架构
├── database-clear.sql    # 数据库重置
├── custom-patterns.json  # 自定义检测模式
├── README.md             # 项目说明
├── CLAUDE.md             # 开发指南
├── BACKUP_SECURITY.md    # 备份安全文档
└── CHANGELOG.md          # 更新日志
```

### 📦 NPM 脚本清理
保留的核心命令：
```bash
npm run dev             # 开发模式
npm run build           # 构建生产版本
npm run start           # 启动生产服务器
npm run scan            # 手动运行GitHub扫描
npm run export:keys     # 导出密钥数据
npm run decrypt:backup  # 解密备份文件
npm run restore:backup  # 恢复备份到数据库
npm run extract:keys    # 手动提取密钥
```

### 🗄️ 归档内容
以下内容已移动到 `archived/` 文件夹，但仍可访问：
- **SQL脚本**：30+ 个开发过程中的临时 SQL 脚本
- **分析脚本**：20+ 个数据分析和清理脚本
- **技术文档**：开发过程中的技术指南和故障排除文档
- **分析报告**：各种密钥类型的分析报告 JSON 文件
- **测试文件**：模式测试和验证脚本

### 🔒 安全功能
- **加密备份**：GPG AES256 加密的数据库备份
- **密钥导出**：支持多格式密钥数据导出
- **访问控制**：严格的管理员权限控制

### 📋 核心功能保持不变
- GitHub API 密钥监控 (20+ 服务商支持)
- 实时密钥验证
- 管理员后台
- 统计分析面板
- 自动化扫描 (GitHub Actions)

---

## v1.x.x - 开发历史

所有之前的开发历史和技术文档已归档到 `archived/docs/` 文件夹中。

### 主要里程碑：
- **v1.0**: 基础监控系统
- **v1.1**: 添加多服务商支持  
- **v1.2**: 实现管理员系统
- **v1.3**: 统计分析功能
- **v1.4**: xAI 和 DeepSeek 支持
- **v1.5**: 密钥导出工具
- **v1.6**: 加密备份系统
- **v1.9**: 统计计算修复
- **v2.0**: 项目结构整理

## 🚀 升级说明

从旧版本升级到 v2.0：
1. 旧的 npm 脚本命令可能不再可用
2. 如需访问归档的脚本，请查看 `archived/scripts/` 文件夹
3. 数据库结构保持不变，无需迁移
4. 环境变量配置保持不变

## 📞 支持

如果您需要使用归档的功能或有任何问题：
- 查看 `CLAUDE.md` 获取开发指南
- 检查 `archived/docs/` 中的相关文档
- 在 GitHub Issues 中提出问题