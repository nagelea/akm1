# 批量导入功能使用指南

## 功能概述

管理员控制台的批量导入功能允许管理员快速导入大量API密钥到监控系统中。该功能支持多种AI服务的密钥格式自动识别和批量处理。

## 访问路径

1. 登录管理员控制台：`http://localhost:3000/admin`
2. 使用管理员账户登录（默认：admin@test.com / temp123）
3. 点击"📥 批量导入"标签页

## 主要功能

### 1. 智能密钥识别

系统支持以下AI服务的密钥格式自动识别：

- **OpenAI**: `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Anthropic**: `sk-ant-api03-xxxxx...`
- **Google AI**: `AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **GitHub**: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **GitLab**: `glpat-xxxxxxxxxxxxxxxxxxxx`
- **Hugging Face**: `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **其他AI服务**: Cohere, Replicate, Azure OpenAI, AWS Bedrock等

### 2. 配置选项

在导入前，可以配置以下参数：

- **密钥类型**: 选择要识别的AI服务类型
- **严重程度**: 低危/中危/高危
- **置信度**: 低/中/高
- **数据源类型**: 手动导入/GitHub仓库/GitLab仓库/其他平台等
- **来源URL**: (可选) 密钥的来源链接

### 3. 导入流程

#### 步骤1: 预览提取
1. 在文本框中粘贴包含密钥的内容
2. 点击"🔍 预览提取"按钮
3. 系统会显示识别到的密钥列表和格式信息

#### 步骤2: 批量导入
1. 确认预览结果正确
2. 点击"📥 批量导入"按钮
3. 系统自动处理：
   - 提取匹配的密钥
   - 检查重复（避免重复导入）
   - 保存到数据库
   - 显示导入结果统计

### 4. 结果统计

导入完成后会显示详细统计：
- **检测到**: 在文本中识别到的密钥总数
- **已导入**: 成功导入到数据库的密钥数
- **重复跳过**: 已存在的重复密钥数
- **导入失败**: 因错误导致失败的密钥数

## 使用场景

### 1. 安全扫描结果导入
```text
从安全扫描工具的输出结果中批量导入发现的密钥
```

### 2. GitHub/GitLab仓库分析
```text
从代码仓库扫描的日志或报告中导入密钥
```

### 3. 配置文件批量处理
```text
从配置文件备份或环境变量文件中导入密钥
```

### 4. 安全事件响应
```text
快速导入安全事件中发现的泄露密钥
```

## 示例操作

### 示例1: 导入OpenAI密钥
```text
输入内容：
OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef12345678
DATABASE_URL=postgresql://user:pass@localhost/db
ANTHROPIC_KEY=sk-ant-api03-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123

配置：
- 密钥类型: OpenAI
- 严重程度: 高危
- 置信度: 高
- 数据源类型: 配置文件

结果：识别到1个OpenAI密钥，其他格式被忽略
```

### 示例2: 导入多种密钥类型
```text
为了导入多种类型的密钥，需要分别处理：
1. 先选择"OpenAI"类型，导入OpenAI密钥
2. 再选择"Anthropic"类型，导入Anthropic密钥
3. 以此类推...
```

## 安全特性

### 1. 完整密钥安全存储
- **完整密钥存储**：存储在独立的敏感数据表中，支持后续验证
- **权限控制**：使用RLS策略，只有管理员可访问敏感数据
- **SHA-256哈希**：用于重复检测和去重
- **部分密钥显示**：前端只显示密钥前10位，保护完整信息

### 2. 自动验证功能
- **即时验证**：导入后可选择立即验证密钥有效性
- **API调用**：直接调用相应服务的API验证密钥
- **状态更新**：自动更新密钥状态（valid/invalid/unverified）
- **验证统计**：提供详细的验证成功/失败统计

### 3. 重复检测
- 自动检测已存在的密钥
- 避免重复导入相同密钥
- 提供重复统计信息

### 4. 访问控制
- 只有管理员账户可以访问
- 操作日志记录
- 导入历史追踪

## 注意事项

### 1. 格式匹配
- 系统使用正则表达式匹配密钥格式
- 只会识别完全匹配格式的密钥
- 不完整或格式错误的密钥会被忽略

### 2. 性能考虑
- 单次建议导入不超过1000个密钥
- 大量数据建议分批导入
- 导入过程中避免刷新页面

### 3. 数据验证
- 导入的密钥初始状态为"未验证"
- 需要通过验证调试功能进行验证
- 可在"敏感密钥"页面查看和管理

## 错误处理

### 常见错误及解决方案

1. **未找到匹配密钥**
   - 检查密钥类型选择是否正确
   - 确认密钥格式是否完整
   - 查看支持的格式示例

2. **导入失败**
   - 检查网络连接
   - 确认数据库连接正常
   - 查看浏览器控制台错误信息

3. **大量重复跳过**
   - 密钥可能已经存在
   - 检查"敏感密钥"页面确认
   - 考虑是否需要更新现有记录

## 开发信息

### 技术实现
- 前端：React + Tailwind CSS
- 后端：Supabase PostgreSQL
- 哈希算法：SHA-256 (Web Crypto API)
- 正则表达式：多模式密钥识别

### 数据库结构
```sql
-- 公开密钥信息表
CREATE TABLE leaked_keys (
  key_type VARCHAR(50),      -- AI服务类型
  key_preview VARCHAR(100),  -- 密钥前缀（显示用）
  key_hash VARCHAR(64),      -- SHA-256哈希值
  confidence VARCHAR(10),    -- 置信度
  severity VARCHAR(10),      -- 严重程度
  status VARCHAR(20),        -- 验证状态 (valid/invalid/unverified)
  source_type VARCHAR(20),   -- 数据源类型
  file_path VARCHAR(500),    -- 文件路径/来源URL
  last_verified TIMESTAMP,   -- 最后验证时间
  ...
);

-- 敏感数据表（完整密钥存储）
CREATE TABLE leaked_keys_sensitive (
  key_id INTEGER,            -- 关联主表ID
  full_key TEXT,            -- 完整的原始密钥
  raw_context TEXT,         -- 原始上下文
  github_url TEXT,          -- 直接访问链接
  ...
);
```

### 已实现功能
- [x] **完整密钥安全存储**：支持后续验证和分析
- [x] **自动验证功能**：导入后立即验证密钥有效性
- [x] **智能格式识别**：支持13+种AI服务密钥格式
- [x] **重复检测**：基于SHA-256哈希的去重机制
- [x] **权限控制**：RLS策略保护敏感数据访问

### 扩展功能计划
- [ ] 导入历史记录和审计日志
- [ ] 自定义密钥模式配置
- [ ] 导入模板和批量配置
- [ ] RESTful API接口支持
- [ ] 加密存储选项