# 🔑 API 密钥导出工具使用指南

这个工具允许你从数据库中导出指定类型、状态或条件的API密钥数据。

## 🚀 快速开始

### 基本用法

```bash
# 查看帮助信息
npm run export:keys -- --help

# 导出所有 OpenAI 密钥
npm run export:keys -- --type openai

# 导出有效的 xAI 密钥为 CSV 格式
npm run export:keys -- --type xai --status valid --format csv
```

## 📋 命令选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `--type <type>` | 指定密钥类型 | `--type openai` |
| `--status <status>` | 指定密钥状态 | `--status valid` |
| `--format <format>` | 导出格式 (json/csv/txt) | `--format csv` |
| `--output <file>` | 输出文件路径 | `--output my-keys.json` |
| `--include-sensitive` | 包含完整密钥信息 | `--include-sensitive` |
| `--limit <number>` | 限制导出数量 | `--limit 100` |
| `--help` | 显示帮助信息 | `--help` |

## 🔧 支持的密钥类型

- `openai` - OpenAI API 密钥
- `openai_project` - OpenAI 项目密钥
- `openai_user` - OpenAI 用户密钥
- `openai_service` - OpenAI 服务账户密钥
- `deepseek` - DeepSeek API 密钥
- `xai` - xAI (Grok) API 密钥
- `anthropic` - Anthropic Claude API 密钥
- `google_api` - Google AI API 密钥
- `openrouter` - OpenRouter API 密钥
- `huggingface` - HuggingFace API 密钥
- `replicate` - Replicate API 密钥
- `perplexity` - Perplexity AI API 密钥
- `groq` - Groq API 密钥
- `fireworks` - Fireworks AI API 密钥
- `together` - Together AI API 密钥

## 📊 支持的状态

- `valid` - 已验证有效的密钥
- `invalid` - 已验证无效的密钥
- `unknown` - 未验证状态的密钥
- `revoked` - 已被撤销的密钥

## 📄 导出格式

### JSON 格式 (默认)
```bash
npm run export:keys -- --type openai --format json
```

生成结构化的 JSON 文件，包含完整的元数据信息。

### CSV 格式
```bash
npm run export:keys -- --type openai --format csv
```

生成表格形式的 CSV 文件，适合在 Excel 中打开。

### TXT 格式
```bash
npm run export:keys -- --type openai --format txt
```

生成人类可读的文本报告格式。

## 💡 使用示例

### 1. 导出特定类型的密钥
```bash
# 导出所有 OpenAI 密钥
npm run export:keys -- --type openai

# 导出所有 xAI 密钥
npm run export:keys -- --type xai

# 导出所有 Google API 密钥
npm run export:keys -- --type google_api
```

### 2. 按状态过滤
```bash
# 导出所有有效的密钥
npm run export:keys -- --status valid

# 导出所有未知状态的密钥
npm run export:keys -- --status unknown

# 导出有效的 Anthropic 密钥
npm run export:keys -- --type anthropic --status valid
```

### 3. 不同格式导出
```bash
# 导出为 CSV 格式
npm run export:keys -- --type openai --format csv

# 导出为文本报告
npm run export:keys -- --type xai --format txt

# 导出为 JSON（默认）
npm run export:keys -- --type anthropic
```

### 4. 限制导出数量
```bash
# 只导出前 50 个密钥
npm run export:keys -- --type openai --limit 50

# 导出前 100 个有效密钥
npm run export:keys -- --status valid --limit 100
```

### 5. 包含敏感信息
```bash
# 导出包含完整密钥的数据（谨慎使用！）
npm run export:keys -- --type openai --include-sensitive

# 导出 xAI 密钥的完整信息为 JSON
npm run export:keys -- --type xai --include-sensitive --format json
```

### 6. 自定义输出文件
```bash
# 指定输出文件名
npm run export:keys -- --type openai --output my-openai-keys.json

# 导出到特定路径
npm run export:keys -- --type xai --format csv --output ./exports/xai-keys.csv
```

## ⚠️ 安全注意事项

1. **敏感信息保护**: 使用 `--include-sensitive` 选项时要特别小心，确保导出的文件被妥善保护。

2. **访问权限**: 确保只有授权人员能够运行此工具和访问导出的文件。

3. **文件清理**: 导出完成后，及时删除包含敏感信息的临时文件。

4. **环境变量**: 确保 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 环境变量已正确设置。

## 🔧 环境要求

在运行工具之前，请确保设置了以下环境变量：

```bash
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-service-key"
```

## 📊 输出文件

导出的文件会自动命名，格式为：
```
keys_export_{type}_{status}_{timestamp}.{format}
```

例如：
- `keys_export_openai_valid_2024-01-15T10-30-00.json`
- `keys_export_xai_2024-01-15T10-30-00.csv`

## 🐛 故障排除

### 常见错误及解决方案

1. **"supabaseUrl is required"**
   - 确保设置了 `SUPABASE_URL` 环境变量

2. **"Database query failed"**
   - 检查 `SUPABASE_SERVICE_KEY` 是否正确
   - 确保数据库连接正常

3. **"Unsupported key type"**
   - 检查 `--type` 参数是否拼写正确
   - 使用 `--help` 查看支持的类型列表

4. **"File write failed"**
   - 检查输出目录的写入权限
   - 确保磁盘空间充足

## 📞 获取帮助

运行以下命令获取完整的帮助信息：

```bash
npm run export:keys -- --help
```