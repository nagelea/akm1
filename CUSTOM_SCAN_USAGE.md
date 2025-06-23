# 自定义正则模式扫描使用指南

## 如何使用自定义模式调用GitHub Actions爬取数据

### 1. 通过GitHub网页界面手动触发

1. 访问你的GitHub仓库
2. 点击 **Actions** 标签
3. 选择 **API Key Scanner** 工作流
4. 点击 **Run workflow** 按钮
5. 填写参数：
   - **Scan Type**: 选择 `custom`
   - **Custom Search Pattern**: 输入正则表达式（用于GitHub搜索）
   - **Custom Service Name**: 输入服务名称（用于标识）

### 2. 通过GitHub CLI触发

```bash
# 安装GitHub CLI
gh auth login

# 触发自定义扫描
gh workflow run "API Key Scanner" \
  --field scan_type=custom \
  --field custom_pattern="your-api-prefix-" \
  --field custom_service="Your Service Name"
```

### 3. 通过API触发

```bash
curl -X POST \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/actions/workflows/scan-api-keys.yml/dispatches \
  -d '{
    "ref": "main",
    "inputs": {
      "scan_type": "custom",
      "custom_pattern": "your-api-prefix-",
      "custom_service": "Your Service Name"
    }
  }'
```

## 自定义模式示例

### 1. 搜索特定前缀的API密钥

```yaml
# 搜索以 "api_" 开头的密钥
scan_type: custom
custom_pattern: "api_"
custom_service: "Generic API Keys"
```

### 2. 搜索特定服务的密钥

```yaml
# 搜索 Stripe API 密钥
scan_type: custom
custom_pattern: "sk_live_"
custom_service: "Stripe"
```

```yaml
# 搜索 SendGrid API 密钥
scan_type: custom
custom_pattern: "SG\\."
custom_service: "SendGrid"
```

### 3. 搜索JWT令牌

```yaml
# 搜索JWT格式的令牌
scan_type: custom
custom_pattern: "eyJ[A-Za-z0-9+/]+"
custom_service: "JWT Tokens"
```

### 4. 搜索特定长度的密钥

```yaml
# 搜索32字符的十六进制密钥
scan_type: custom
custom_pattern: "[a-f0-9]{32}"
custom_service: "32-char Hex Keys"
```

## 工作原理

1. **GitHub搜索阶段**：
   - 使用您的自定义模式在GitHub上搜索文件
   - 支持多种编程语言：Python, JavaScript, TypeScript, Go, Java
   - 排除Fork仓库以减少重复

2. **内容检测阶段**：
   - 下载匹配的文件内容
   - 使用正则表达式检测您的自定义模式
   - 应用假密钥过滤和上下文验证

3. **数据存储阶段**：
   - 保存检测到的密钥到数据库
   - 使用您指定的服务名称标识
   - 应用安全的密钥掩码显示

## 注意事项

### ⚠️ 模式格式要求

- **搜索模式**：用于GitHub搜索，应该是简单的字符串
- **正则检测**：系统会自动将搜索模式转换为正则表达式
- 如果需要复杂的正则，请确保转义特殊字符

### 🔍 搜索效率建议

- 使用具体的前缀或特征（如 "sk_", "api_"）
- 避免过于通用的模式（如单个字母）
- 考虑API密钥的典型格式和长度

### 📊 结果查看

扫描完成后，可以在管理面板中查看结果：
- 密钥类型显示为您指定的服务名称
- 置信度根据模式复杂度自动设置
- 支持所有标准的验证和管理功能

## 高级用法

### 批量自定义扫描

```bash
# 扫描多个服务（需要分别触发）
services=(
  "sk_live_:Stripe"
  "SG\\.:SendGrid"  
  "xoxb-:Slack"
  "ghp_:GitHub"
)

for service in "${services[@]}"; do
  pattern="${service%:*}"
  name="${service#*:}"
  
  gh workflow run "API Key Scanner" \
    --field scan_type=custom \
    --field custom_pattern="$pattern" \
    --field custom_service="$name"
    
  sleep 10  # 避免触发过于频繁
done
```

### 监控特定仓库类型

可以修改搜索查询以针对特定类型的仓库：
- 添加语言限制：`language:python`
- 添加大小限制：`size:>100`
- 添加活跃度：`pushed:>2024-01-01`

## 故障排除

### 常见问题

1. **无结果返回**：
   - 检查模式是否过于严格
   - 尝试更简单的搜索模式
   - 查看GitHub搜索限制

2. **误报过多**：
   - 使用更具体的模式
   - 添加上下文关键词
   - 调整正则表达式精确度

3. **扫描失败**：
   - 检查GitHub Token权限
   - 验证Supabase连接
   - 查看工作流日志

### 查看执行日志

1. 访问GitHub Actions页面
2. 点击对应的工作流执行
3. 查看详细的扫描日志和结果统计