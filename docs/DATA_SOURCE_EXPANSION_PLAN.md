# 数据源扩展计划

## 🎯 阶段1: 代码托管平台 (推荐优先实现)

### GitLab Integration
```javascript
// scripts/gitlab-scanner.js
const GITLAB_API = 'https://gitlab.com/api/v4'
const searchEndpoints = [
  '/search?scope=blobs&search=sk-',           // OpenAI keys
  '/search?scope=blobs&search=sk-ant-',       // Anthropic keys  
  '/search?scope=blobs&search=AIza',          // Google AI keys
]
```

**优势**: 
- ✅ 公开API，类似GitHub
- ✅ 大量开源项目
- ✅ 支持高级搜索
- ✅ 法律风险低

### Bitbucket Integration
```javascript
// Bitbucket API v2.0
const BITBUCKET_API = 'https://api.bitbucket.org/2.0'
// 需要处理分页和认证
```

## 🎯 阶段2: 公开代码片段平台

### 高价值目标
- **Pastebin** - 最大的代码片段分享平台
- **GitHub Gist** - 已有GitHub API，容易扩展
- **CodePen** - 前端代码分享
- **JSFiddle** - JavaScript代码片段
- **Repl.it** - 在线编程环境

### 实现示例
```javascript
// scripts/snippet-scanner.js
const SNIPPET_SOURCES = {
  pastebin: {
    api: 'https://scrape.pastebin.com/api',
    rateLimit: '1req/sec',  // 严格限制
    patterns: ['openai', 'anthropic', 'api_key']
  },
  
  gist: {
    api: 'https://api.github.com/gists',
    auth: process.env.GITHUB_TOKEN,
    searchTerms: ['sk-', 'api_key', 'secret_key']
  }
}
```

## 🎯 阶段3: 开发者社区和论坛

### 目标平台
- **Stack Overflow** - 编程问答
- **Reddit** (`r/programming`, `r/MachineLearning`)
- **Discord服务器** (公开频道)
- **Telegram频道** (公开)
- **Slack工作区** (公开)

### 技术挑战
```javascript
// 需要处理反爬虫机制
const COMMUNITY_SOURCES = {
  stackoverflow: {
    method: 'web_scraping',  // 无公开搜索API
    challenges: ['Rate limiting', 'CAPTCHA', 'IP blocking'],
    solution: '使用代理轮换 + 延迟'
  },
  
  reddit: {
    api: 'https://www.reddit.com/dev/api/',
    auth: 'OAuth2',
    searchSubreddits: ['programming', 'MachineLearning', 'OpenAI']
  }
}
```

## 🎯 阶段4: 文档和博客平台

### 技术博客
- **Medium** - 技术文章
- **Dev.to** - 开发者社区
- **Hashnode** - 技术博客
- **个人博客** (通过搜索引擎发现)

### 文档网站
- **GitBook** - 技术文档
- **Notion公开页面** - 团队文档
- **Confluence公开空间** - 企业文档

## 🎯 阶段5: 移动应用和软件

### APK/IPA 分析
```javascript
// scripts/mobile-app-scanner.js
const APP_SOURCES = {
  android: {
    store: 'Google Play Store',
    method: 'APK解析',
    tools: ['apktool', 'jadx'],
    targets: 'AI相关应用'
  },
  
  ios: {
    store: 'App Store',  
    method: 'IPA分析',
    challenges: '加密和混淆',
    legal: '需要谨慎处理'
  }
}
```

## 🎯 阶段6: 高级数据源

### 搜索引擎集成
```javascript
// scripts/search-engine-scanner.js
const SEARCH_ENGINES = {
  google: {
    dorks: [
      'filetype:py "sk-" site:github.com',
      'filetype:js "AIza" -site:googleapis.com',
      '"sk-ant-" filetype:txt'
    ],
    api: 'Custom Search API',
    quota: '100 queries/day (free)'
  },
  
  bing: {
    api: 'Bing Search API',
    quota: '3000 queries/month (free)'
  }
}
```

### 安全情报源
```javascript
// 需要特殊权限和安全考虑
const INTELLIGENCE_SOURCES = {
  shodan: {
    api: 'https://api.shodan.io',
    purpose: '扫描暴露的配置文件',
    cost: '$59/month'
  },
  
  censys: {
    api: 'https://search.censys.io/api',
    purpose: '网络资产发现',
    quota: '250 queries/month (free)'
  }
}
```

## 📋 实施优先级矩阵

| 数据源类型 | 实现难度 | 数据价值 | 法律风险 | 推荐优先级 |
|------------|----------|----------|----------|------------|
| GitLab/Bitbucket | 低 | 高 | 低 | 🟢 第一优先 |
| GitHub Gist | 低 | 中 | 低 | 🟢 第一优先 |
| Pastebin | 中 | 高 | 中 | 🟡 第二优先 |
| Stack Overflow | 高 | 中 | 中 | 🟡 第二优先 |
| Reddit/论坛 | 高 | 中 | 中 | 🟡 第二优先 |
| 搜索引擎 | 中 | 高 | 低 | 🟡 第二优先 |
| 移动应用 | 极高 | 高 | 高 | 🔴 第三优先 |
| 安全情报 | 高 | 极高 | 低 | 🔴 第三优先 |

## 🛡️ 法律和伦理考虑

### 安全指南
1. **遵守ToS** - 严格遵守各平台服务条款
2. **Rate Limiting** - 实施严格的请求限制
3. **User-Agent** - 使用合适的标识
4. **数据处理** - 只存储必要信息，快速处理敏感数据
5. **通知机制** - 发现泄露后及时通知相关方

### 技术要求
```javascript
// 通用扫描器配置
const SCANNER_CONFIG = {
  rateLimit: {
    requests: 1,
    per: 'second',
    burst: 5
  },
  
  userAgent: 'AI-Key-Monitor/1.0 (Security Research)',
  
  respect: {
    robotsTxt: true,
    noFollow: true,
    politeness: 'high'
  },
  
  privacy: {
    storeMinimal: true,
    encrypt: true,
    deleteAfterReport: true
  }
}
```

## 🚀 快速开始建议

### 第一步：GitLab 集成
1. 复制现有 GitHub 扫描器逻辑
2. 适配 GitLab API v4
3. 测试小规模扫描
4. 逐步扩大范围

### 第二步：Gist 扩展  
1. 扩展现有 GitHub API 调用
2. 添加 Gist 特定的搜索
3. 处理不同的文件结构

### 第三步：监控优化
1. 统一数据源管理
2. 改进去重逻辑
3. 增强报告系统
4. 添加数据源统计

这样的扩展计划既实用又渐进，可以根据你的资源和需求灵活调整！