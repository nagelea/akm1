# 自定义模式配置文件使用指南

## 概述

现在可以通过 `custom-patterns.json` 文件定义自定义检索模式，无需修改代码即可添加新的API密钥检测规则。

## 配置文件结构

### 位置
文件位置：`/custom-patterns.json`（项目根目录）

### 格式
```json
{
  "custom_patterns": [
    {
      "name": "服务名称",
      "search_patterns": ["搜索关键词1", "搜索关键词2"],
      "regex_pattern": "正则表达式",
      "confidence": "high|medium|low",
      "enabled": true|false
    }
  ]
}
```

## 字段说明

### name (必需)
- **用途**：在检测结果中显示的服务名称
- **示例**：`"Stripe API Keys"`, `"SendGrid API Keys"`

### search_patterns (必需)
- **用途**：GitHub搜索时使用的关键词数组
- **原理**：系统会为每个关键词生成多个语言的搜索查询
- **示例**：`["sk_live_", "sk_test_"]` 会生成：
  - `"sk_live_" language:python NOT is:fork`
  - `"sk_live_" language:javascript NOT is:fork`
  - `"sk_test_" language:python NOT is:fork`
  - 等等...

### regex_pattern (必需)
- **用途**：用于从文件内容中精确提取API密钥的正则表达式
- **注意**：需要转义特殊字符（如 `\\` 用于 `\`）
- **示例**：`"(sk_live_|sk_test_)[a-zA-Z0-9]{24,}"`

### confidence (可选)
- **默认值**：`"medium"`
- **选项**：`"high"`, `"medium"`, `"low"`
- **用途**：影响检测结果的置信度评级

### enabled (必需)
- **用途**：是否启用此模式
- **说明**：只有 `enabled: true` 的模式才会被加载和使用

## 预配置示例

项目已包含多个预配置的模式，包括：

### 1. Stripe API Keys
```json
{
  "name": "Stripe API Keys",
  "search_patterns": ["sk_live_", "sk_test_", "rk_live_", "pk_live_", "pk_test_"],
  "regex_pattern": "(sk_live_|sk_test_|rk_live_|pk_live_|pk_test_)[a-zA-Z0-9]{24,}",
  "confidence": "high",
  "enabled": true
}
```

### 2. GitHub Personal Access Tokens
```json
{
  "name": "GitHub Personal Access Tokens",
  "search_patterns": ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"],
  "regex_pattern": "gh[ospru]_[a-zA-Z0-9]{36}",
  "confidence": "high",
  "enabled": false
}
```

### 3. JWT Tokens
```json
{
  "name": "JWT Tokens",
  "search_patterns": ["eyJ", "jwt"],
  "regex_pattern": "eyJ[A-Za-z0-9+/]{10,}\\.[A-Za-z0-9+/]{10,}\\.[A-Za-z0-9+/]{10,}",
  "confidence": "medium",
  "enabled": false
}
```

## 使用方法

### 1. 启用预配置模式
编辑 `custom-patterns.json`，将想要的模式的 `enabled` 设为 `true`：

```json
{
  "name": "SendGrid API Keys",
  "enabled": true  // 改为 true
}
```

### 2. 添加新模式
在 `custom_patterns` 数组中添加新对象：

```json
{
  "name": "My Custom API",
  "search_patterns": ["myapi_", "my-service-key"],
  "regex_pattern": "myapi_[a-zA-Z0-9]{32}",
  "confidence": "high",
  "enabled": true
}
```

### 3. 运行文件配置扫描

#### 通过GitHub Actions
1. 访问 GitHub Actions
2. 选择 "API Key Scanner"
3. 点击 "Run workflow"
4. 选择 `file_custom` 扫描类型
5. 运行

#### 通过命令行
```bash
# 设置环境变量
export SCAN_TYPE=file_custom
export GITHUB_TOKEN=your_token
export SUPABASE_URL=your_url
export SUPABASE_SERVICE_KEY=your_key

# 运行扫描
node scripts/scanner.js
```

#### 通过GitHub CLI
```bash
gh workflow run "API Key Scanner" --field scan_type=file_custom
```

## 正则表达式技巧

### 常用模式
```regex
# 固定前缀 + 随机字符
"prefix_[a-zA-Z0-9]{32}"

# 多个可能的前缀
"(prefix1_|prefix2_|prefix3_)[a-zA-Z0-9]{24,}"

# 特定格式（如UUID）
"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"

# 包含特殊字符
"[a-zA-Z0-9+/]{40,}={0,2}"  # Base64格式
```

### 转义字符
在JSON中需要双重转义：
- `\` → `\\`
- `"` → `\"`
- `.` → `\\.` （如果要匹配字面点号）

## 调试和测试

### 查看加载状态
运行时会显示加载信息：
```
✅ Loaded custom pattern: Stripe API Keys
⏸️ Skipped disabled pattern: SendGrid API Keys
📋 Loaded 1 custom patterns
```

### 验证正则表达式
可以使用在线正则测试工具验证模式：
- [regex101.com](https://regex101.com)
- [regexr.com](https://regexr.com)

## 最佳实践

### 1. 搜索模式优化
- 使用具体的前缀而非通用词汇
- 避免过短的搜索词（容易误匹配）
- 考虑API密钥的常见命名方式

### 2. 正则表达式优化
- 尽可能具体，避免过于宽泛的匹配
- 考虑密钥的实际长度和格式
- 测试边界情况

### 3. 性能考虑
- 不要启用太多低质量的模式
- 优先使用高置信度的模式
- 定期检查和清理不需要的模式

## 故障排除

### 常见问题

1. **模式未加载**
   - 检查 `enabled: true`
   - 验证JSON格式正确性
   - 查看运行日志

2. **正则表达式错误**
   - 检查转义字符
   - 在正则测试工具中验证
   - 查看错误日志

3. **搜索无结果**
   - 验证搜索模式的有效性
   - 检查是否过于具体
   - 尝试更通用的搜索词

### 调试技巧
```bash
# 运行时查看详细日志
node scripts/scanner.js 2>&1 | grep -E "(Loaded|Skipped|Generated)"
```

## 安全注意事项

- 定期审查配置文件，确保模式的准确性
- 避免过于宽泛的模式导致误报
- 测试新模式对性能的影响
- 备份配置文件以防意外修改