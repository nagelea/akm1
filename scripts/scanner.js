const { Octokit } = require('@octokit/rest');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// API密钥检测模式
const KEY_PATTERNS = {
  openai: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'OpenAI',
    confidence: 'high'
  },
  google: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google AI',
    confidence: 'high'
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
    const today = new Date().toISOString().split('T')[0];
    
    const queries = [
      `sk-ant- created:>${today}`,  // Anthropic keys
      `sk- openai created:>${today}`, // OpenAI keys  
      `AIza extension:env created:>${today}`, // Google keys in env files
      `hf_ huggingface created:>${today}`, // HuggingFace keys
      `r8_ replicate created:>${today}`, // Replicate keys
      `api_key extension:js created:>${today}`, // General API keys in JS
      `api_key extension:py created:>${today}`, // General API keys in Python
    ];

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
        per_page: 20,
        sort: 'indexed'
      });

      console.log(`📄 Found ${results.data.items.length} files`);

      for (const item of results.data.items) {
        this.scannedToday++;
        await this.analyzeFile(item);
        await this.sleep(1000);
      }
    } catch (error) {
      if (error.status === 403) {
        console.log('⏳ Rate limited, waiting 60s...');
        await this.sleep(60000);
      } else {
        throw error;
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
    // 过滤明显的假密钥
    if (this.isLikelyFake(key, content)) {
      return false;
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
    const severity = this.assessSeverity(fileInfo.path, content);
    
    // 保存到数据库
    const { error } = await this.supabase.from('leaked_keys').insert({
      key_type: type,
      key_preview: this.maskKey(key),
      key_hash: keyHash,
      file_extension: this.getFileExtension(fileInfo.path),
      repo_language: fileInfo.repository.language || 'unknown',
      context_preview: context,
      severity: severity,
      repo_name: fileInfo.repository.full_name,
      file_path: fileInfo.path
    });

    if (!error) {
      console.log(`🔑 Found new ${type} key in ${fileInfo.repository.full_name}/${fileInfo.path} [${severity}]`);
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
      'xxxxxxx', '123456', 'abcdef', 'replace_me'
    ];
    
    const keyLower = key.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // 检查密钥本身是否包含假密钥特征
    if (fakeIndicators.some(indicator => keyLower.includes(indicator))) {
      return true;
    }
    
    // 检查周围上下文
    const keyIndex = content.indexOf(key);
    const contextStart = Math.max(0, keyIndex - 100);
    const contextEnd = Math.min(content.length, keyIndex + key.length + 100);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    return fakeIndicators.some(indicator => context.includes(indicator));
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