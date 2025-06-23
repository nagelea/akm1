# GitHub Actions 分页配置指南

## 📄 分页功能说明

分页功能允许扫描器获取每个查询的更多搜索结果，而不仅仅是前30个文件。

### 默认行为 vs 分页模式

| 模式 | 每个查询的文件数 | 覆盖率 |
|------|----------------|--------|
| 默认 | 30个文件 | 基础 |
| 保守分页 | 60个文件 (2页×30) | 2倍提升 |
| 平衡分页 | 150个文件 (3页×50) | 5倍提升 |
| 积极分页 | 500个文件 (5页×100) | 16倍提升 |

## ⚙️ GitHub Actions 配置

分页环境变量已经添加到 `.github/workflows/scan-api-keys.yml` 文件中：

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
  # Pagination Configuration
  ENABLE_PAGINATION: true
  MAX_PAGES: 3
  PER_PAGE: 50
```

### 当前设置解释

- `ENABLE_PAGINATION: true` - 启用分页功能
- `MAX_PAGES: 3` - 每个查询最多处理3页结果
- `PER_PAGE: 50` - 每页50个结果

**总计：每个查询最多150个文件** (3页 × 50个/页)

## 🔧 自定义配置选项

如果你想调整分页设置，可以修改 `.github/workflows/scan-api-keys.yml` 中的环境变量：

### 保守设置（推荐用于API限制严格的环境）
```yaml
ENABLE_PAGINATION: true
MAX_PAGES: 2
PER_PAGE: 30
```
- 每个查询60个文件
- 适合：频繁扫描，API配额有限

### 平衡设置（当前默认，推荐用于大多数场景）
```yaml
ENABLE_PAGINATION: true
MAX_PAGES: 3
PER_PAGE: 50
```
- 每个查询150个文件
- 适合：日常扫描，平衡速度和覆盖率

### 积极设置（推荐用于深度扫描）
```yaml
ENABLE_PAGINATION: true
MAX_PAGES: 5
PER_PAGE: 100
```
- 每个查询500个文件
- 适合：一次性深度扫描，API配额充足

### 禁用分页（回到原始行为）
```yaml
ENABLE_PAGINATION: false
MAX_PAGES: 1
PER_PAGE: 30
```
- 每个查询30个文件
- 适合：快速扫描，兼容旧行为

## 📊 API 速率限制考虑

### GitHub API 限制
- **认证用户**: 5000次请求/小时
- **每页请求**: 1次API调用
- **建议**: 每个查询不超过5页以保持在合理范围内

### 扫描频率建议

| 扫描类型 | 频率 | 推荐配置 |
|----------|------|----------|
| 快速扫描 | 每小时 | MAX_PAGES=2, PER_PAGE=30 |
| 常规扫描 | 每4小时 | MAX_PAGES=3, PER_PAGE=50 |
| 深度扫描 | 每天 | MAX_PAGES=5, PER_PAGE=100 |

## 🚀 性能影响

### 扫描时间估算
- **页面间延迟**: 3秒（避免API限流）
- **文件分析延迟**: 0.8秒/文件
- **总时间计算**: (页数-1) × 3秒 + 文件数 × 0.8秒

**示例**（150个文件，3页）:
- 页面延迟: (3-1) × 3 = 6秒
- 分析时间: 150 × 0.8 = 120秒
- **总计**: ~2分钟/查询

### 日志输出示例
```
📄 Pagination config: enabled=true, maxPages=3, perPage=50
🔎 Searching: "GROQ_API_KEY" NOT is:fork
📄 Processing page 1/3...
📄 Found 50 files on page 1 (total available: 150)
🔍 Analyzing: user/repo/file.py (page 1)
⏳ Waiting 3s before next page...
📄 Processing page 2/3...
✅ Completed processing 150 files across 3 pages
```

## 🎯 推荐行动

✅ **当前配置已优化** - 无需额外操作，分页功能已启用

如需调整：
1. 编辑 `.github/workflows/scan-api-keys.yml`
2. 修改环境变量部分的数值
3. 提交更改即可生效

**注意**: 更改会在下次GitHub Actions运行时生效。