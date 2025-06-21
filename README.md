# 🔐 AI API Key Monitor

实时监控GitHub上泄露的AI API密钥，包括OpenAI、Anthropic、Google AI等主流服务商。

## 🚀 功能特性

- **实时监控**: 每6小时自动扫描GitHub最新代码
- **多平台支持**: 覆盖OpenAI、Anthropic、Google、HuggingFace等
- **智能过滤**: 自动识别和过滤假密钥、测试密钥
- **可视化面板**: 直观的数据统计和趋势图表
- **严重程度分级**: 高危/中危/低危分类管理
- **零成本部署**: 基于免费服务搭建

## 🏗️ 技术架构

```
GitHub API ←─── GitHub Actions (定时扫描)
    ↓
数据处理 ←─── Serverless Function  
    ↓
Supabase DB ←─── 数据存储和API
    ↓
Next.js App ←─── 用户界面
```

## 📦 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <your-repo-url>
cd api-key-monitor

# 安装依赖
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填入配置：

```bash
cp .env.example .env.local
```

需要配置的环境变量：
- `GITHUB_TOKEN`: GitHub Personal Access Token
- `SUPABASE_URL`: Supabase项目URL
- `SUPABASE_ANON_KEY`: Supabase匿名密钥
- `SUPABASE_SERVICE_KEY`: Supabase服务密钥

### 3. 设置数据库

在Supabase中执行 `database.sql` 文件创建表结构：

```sql
-- 复制database.sql中的内容到Supabase SQL编辑器执行
```

### 4. 运行项目

```bash
# 开发模式
npm run dev

# 运行扫描器（测试）
npm run scan

# 构建生产版本
npm run build
npm run start
```

## 🔧 配置说明

### GitHub Token权限

需要的最小权限：
- `public_repo`: 访问公共仓库
- `read:org`: 读取组织信息（可选）

### Supabase配置

1. 创建新项目
2. 导入 `database.sql` 架构
3. 配置RLS策略
4. 获取API密钥

### GitHub Actions设置

在仓库Settings > Secrets中添加：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

## 📊 监控指标

### 支持的API服务商

| 服务商 | 密钥格式 | 检测准确度 |
|--------|----------|------------|
| OpenAI | `sk-[48字符]` | 高 |
| Anthropic | `sk-ant-[95字符]` | 高 |
| Google AI | `AIza[35字符]` | 高 |
| HuggingFace | `hf_[34字符]` | 高 |
| Cohere | UUID格式 | 中 |
| Replicate | `r8_[40字符]` | 高 |

### 严重程度判定

- **高危**: 生产环境、部署相关文件
- **中危**: 配置文件、环境变量文件  
- **低危**: 测试文件、示例代码

## 🚀 部署指南

### Vercel部署（推荐）

```bash
# 安装Vercel CLI
npm i -g vercel

# 部署
vercel

# 配置环境变量
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
```

### 手动部署

1. 构建项目: `npm run build`
2. 上传到服务器
3. 配置环境变量
4. 启动服务: `npm run start`

## 🔒 安全考虑

- **不存储完整密钥**: 仅保存哈希值和预览
- **访问控制**: 基于Supabase RLS
- **数据脱敏**: 自动掩码敏感信息
- **合规性**: 遵循GitHub ToS和API使用条款

## 📈 性能优化

- 数据库索引优化
- 预聚合统计数据
- API限流保护
- 缓存机制

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交变更
4. 发起Pull Request

## 📄 许可证

MIT License - 详见 LICENSE 文件

## ⚠️ 免责声明

本项目仅用于安全研究和教育目的。使用时请遵守：
- GitHub服务条款
- 相关法律法规
- 道德和伦理准则

发现泄露密钥应及时通知相关开发者，协助修复安全问题。