# 🔐 AI API Key Monitor

实时监控GitHub上泄露的AI API密钥，包括OpenAI、Anthropic、Google AI等主流服务商。

## 🚀 功能特性

- **实时监控**: 每6小时自动扫描GitHub最新代码
- **多平台支持**: 覆盖OpenAI、Anthropic、Google、HuggingFace等
- **智能过滤**: 自动识别和过滤假密钥、测试密钥
- **可视化面板**: 直观的数据统计和趋势图表
- **管理后台**: 管理员可查看完整密钥并验证有效性
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
Next.js App ←─── 用户界面 + 管理后台
```

## 📦 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone https://github.com/nagelea/akm1.git
cd akm1

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

#### 步骤1：清空现有数据库（如果需要）
```sql
-- 在Supabase SQL编辑器中执行 database-clear.sql
-- ⚠️ 警告：这会删除所有现有数据
```

#### 步骤2：创建新数据库结构
```sql
-- 在Supabase SQL编辑器中执行 database-simple.sql
-- 这会创建所有表、视图、策略和示例数据
```

#### 步骤3：创建管理员账户
1. **在Supabase Dashboard中**：
   - 进入 Authentication > Users
   - 点击 "Add User"
   - 邮箱：`admin@test.com`
   - 密码：`temp123`
   - 勾选 "Auto Confirm User"

2. **验证数据库记录**：
   ```sql
   -- 检查admin_users表中是否有记录
   SELECT * FROM admin_users WHERE email = 'admin@test.com';
   ```

### 4. 运行项目

```bash
# 开发模式
npm run dev

# 手动运行扫描器（测试）
npm run scan

# 构建生产版本
npm run build
npm run start
```

### 5. 访问应用

- **公共监控面板**: http://localhost:3000
- **管理员后台**: http://localhost:3000/admin
  - 用户名：`admin@test.com`
  - 密码：`temp123`

## 🔧 配置说明

### GitHub Token权限

需要的最小权限：
- `public_repo`: 访问公共仓库
- `read:org`: 读取组织信息（可选）

### Supabase配置

1. 创建新项目
2. 执行 `database-clear.sql` 清空（如果需要）
3. 执行 `database-simple.sql` 创建结构
4. 配置RLS策略
5. 获取API密钥

### GitHub Actions设置

在仓库Settings > Secrets中添加：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### Vercel部署设置

添加环境变量：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`  
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

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
| Azure OpenAI | 32字符 | 低 |
| Mistral AI | 32字符 | 低 |

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
vercel env add NEXT_PUBLIC_SUPABASE_URL  
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 手动部署

1. 构建项目: `npm run build`
2. 上传到服务器
3. 配置环境变量
4. 启动服务: `npm run start`

## 🔒 安全考虑

### 数据保护
- **公共数据脱敏**: 公共界面只显示掩码密钥
- **管理员隔离**: 完整密钥仅管理员可见
- **访问审计**: 所有敏感操作记录日志
- **权限控制**: 基于RLS的严格权限管理

### 合规性
- 遵循GitHub服务条款
- 符合数据保护法规
- 用于安全研究目的

## 🛡️ 管理后台功能

### 密钥管理
- **查看完整密钥**: 管理员可查看原始API密钥
- **密钥验证**: 实时验证密钥在各平台的有效性
- **源码定位**: 直接跳转到GitHub源文件
- **状态管理**: 标记密钥为有效/无效/已撤销

### 监控功能
- **实时统计**: 今日/本周/总计数据
- **严重程度分析**: 高危密钥警报
- **趋势分析**: 历史数据和趋势图表
- **访问日志**: 完整的操作审计记录

## 📈 性能优化

- 数据库索引优化
- 预聚合统计数据
- API限流保护
- GitHub API速率限制管理

## 🗃️ 数据库文件说明

- `database-clear.sql`: 清空现有数据库的脚本
- `database-simple.sql`: 创建完整数据库结构
- `database.sql`: 原始复杂版本（已弃用）

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

## 🆘 故障排除

### 常见问题

1. **管理员登录失败**
   - 检查Supabase Auth中是否创建了用户
   - 确认admin_users表中有对应记录
   - 验证邮箱地址完全匹配

2. **扫描器无结果**
   - 检查GitHub Token权限
   - 验证Supabase服务密钥
   - 查看GitHub Actions日志

3. **数据库连接失败**
   - 确认环境变量设置正确
   - 检查Supabase URL和密钥
   - 验证RLS策略配置

4. **部署到Vercel失败**
   - 检查所有环境变量是否配置
   - 确认构建过程无错误
   - 查看Vercel部署日志

### 获取帮助

- GitHub Issues: 报告bug和功能请求
- 查看日志: 使用浏览器开发者工具
- 数据库调试: 使用Supabase Dashboard