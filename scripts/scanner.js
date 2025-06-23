const { Octokit } = require('@octokit/rest');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// API密钥检测模式 - 扩展版本，按优先级排序
const KEY_PATTERNS = {
  // 最高特异性模式（优先检测具体格式）
  anthropic: {
    pattern: /sk-ant-api\d+-[a-zA-Z0-9_-]+/g,
    name: 'Anthropic Claude',
    confidence: 'high'
  },
  anthropic_precise: {
    pattern: /sk-ant-api03-[\w\-]{93}AA/g,
    name: 'Anthropic Claude (Precise)',
    confidence: 'high'
  },
  openai_project: {
    pattern: /sk-proj-[a-zA-Z0-9_-]{64,}/g,
    name: 'OpenAI Project',
    confidence: 'high'
  },
  openai_user: {
    pattern: /sk-user-[a-zA-Z0-9_-]{64,}/g,
    name: 'OpenAI User',
    confidence: 'high'
  },
  openai_service: {
    pattern: /sk-svcacct-[a-zA-Z0-9_-]{64,}/g,
    name: 'OpenAI Service Account',
    confidence: 'high'
  },
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
  openrouter: {
    pattern: /sk-or-[a-zA-Z0-9-]{32,68}/g,
    name: 'OpenRouter',
    confidence: 'high'
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
  perplexity: {
    pattern: /pplx-[a-zA-Z0-9]{56}/g,
    name: 'Perplexity AI',
    confidence: 'high'
  },
  deepseek: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'DeepSeek',
    confidence: 'medium',
    context_required: ['deepseek']
  },
  google: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google AI',
    confidence: 'high'
  },
  google_precise: {
    pattern: /AIzaSy[a-zA-Z0-9_-]{33}/g,
    name: 'Google AI (Precise)',
    confidence: 'high'
  },
  palm: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google PaLM',
    confidence: 'high'
  },
  gemini: {
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    name: 'Google Gemini',
    confidence: 'high'
  },
  fireworks: {
    pattern: /fw_[a-zA-Z0-9]{32,48}/g,
    name: 'Fireworks AI',
    confidence: 'high'
  },
  fal_ai: {
    pattern: /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([a-f0-9]{32})/g,
    name: 'FAL.AI',
    confidence: 'high'
  },
  groq: {
    pattern: /gsk_[a-zA-Z0-9]{52}/g,
    name: 'Groq',
    confidence: 'high'
  },
  anyscale: {
    pattern: /esecret_[a-zA-Z0-9]{32}/g,
    name: 'Anyscale',
    confidence: 'high'
  },
  voyage: {
    pattern: /pa-[a-zA-Z0-9_-]{43}/g,
    name: 'Voyage AI',
    confidence: 'high'
  },
  stability: {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    name: 'Stability AI',
    confidence: 'medium',
    context_required: ['stability', 'stable']
  },
  elevenlabs: {
    pattern: /[a-f0-9]{32}/g,
    name: 'ElevenLabs',
    confidence: 'low',
    context_required: ['elevenlabs', 'eleven']
  },
  runpod: {
    pattern: /[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/g,
    name: 'RunPod',
    confidence: 'medium',
    context_required: ['runpod']
  },
  together: {
    pattern: /[a-f0-9]{64}/g,
    name: 'Together AI',
    confidence: 'low',
    context_required: ['together']
  },
  cohere: {
    pattern: /[a-zA-Z0-9]{40}/g,
    name: 'Cohere',
    confidence: 'low',
    context_required: ['cohere']
  },
  google_service: {
    pattern: /"private_key":\s*"[^"]*"/g,
    name: 'Google Service Account',
    confidence: 'medium'
  },
  // 低特异性模式（最后检测，避免误匹配）
  azure_openai: {
    pattern: /[a-zA-Z0-9]{32}/g,
    name: 'Azure OpenAI',
    confidence: 'low',
    context_required: ['azure', 'openai']
  },
  mistral: {
    pattern: /[a-zA-Z0-9]{32}/g,
    name: 'Mistral AI',
    confidence: 'low',
    context_required: ['mistral']
  },
  vertex_ai: {
    pattern: /[a-zA-Z0-9_-]{20,}/g,
    name: 'Google Vertex AI',
    confidence: 'low',
    context_required: ['vertex', 'gcp', 'google-cloud']
  }
};

// 加载自定义模式配置
function loadCustomPatterns() {
  try {
    const configPath = path.join(__dirname, '..', 'custom-patterns.json');
    if (!fs.existsSync(configPath)) {
      console.log('📄 No custom patterns file found, using defaults only');
      return {};
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    const customPatterns = {};

    if (config.custom_patterns) {
      config.custom_patterns.forEach((pattern, index) => {
        if (pattern.enabled) {
          try {
            const regexPattern = new RegExp(pattern.regex_pattern, 'g');
            customPatterns[`custom_${index}`] = {
              pattern: regexPattern,
              name: pattern.name,
              confidence: pattern.confidence || 'medium',
              search_patterns: pattern.search_patterns || []
            };
            console.log(`✅ Loaded custom pattern: ${pattern.name}`);
          } catch (error) {
            console.error(`❌ Invalid regex in pattern "${pattern.name}": ${error.message}`);
          }
        } else {
          console.log(`⏸️ Skipped disabled pattern: ${pattern.name}`);
        }
      });
    }

    console.log(`📋 Loaded ${Object.keys(customPatterns).length} custom patterns`);
    return customPatterns;
  } catch (error) {
    console.error('❌ Failed to load custom patterns:', error.message);
    return {};
  }
}

class APIKeyScanner {
  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );
    this.scannedToday = 0;
    this.foundToday = 0;
    this.customPatterns = {}; // 存储动态添加的自定义模式
    this.fileBasedPatterns = loadCustomPatterns(); // 加载文件定义的模式
    
    // 分页配置
    this.paginationConfig = {
      enabled: process.env.ENABLE_PAGINATION === 'true' || false,
      maxPages: parseInt(process.env.MAX_PAGES) || 3,
      perPage: parseInt(process.env.PER_PAGE) || 30
    };
    
    console.log(`📄 Pagination config: enabled=${this.paginationConfig.enabled}, maxPages=${this.paginationConfig.maxPages}, perPage=${this.paginationConfig.perPage}`);
  }

  addCustomPattern(searchPattern, serviceName) {
    // 从搜索模式生成正则表达式
    // 注意：这里需要用户提供正则表达式格式的模式
    try {
      const regexPattern = new RegExp(searchPattern, 'g');
      this.customPatterns.custom_dynamic = {
        pattern: regexPattern,
        name: serviceName,
        confidence: 'medium'
      };
      console.log(`✅ Added custom pattern: ${searchPattern} for ${serviceName}`);
    } catch (error) {
      console.error(`❌ Invalid regex pattern: ${searchPattern}`, error.message);
      // 尝试转换为简单的字符串匹配
      const escapedPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.customPatterns.custom_dynamic = {
        pattern: new RegExp(escapedPattern, 'g'),
        name: serviceName,
        confidence: 'low'
      };
      console.log(`⚠️ Using escaped pattern: ${escapedPattern}`);
    }
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
    const customPattern = process.env.CUSTOM_PATTERN || '';
    const customService = process.env.CUSTOM_SERVICE || 'Custom API';
    
    console.log(`📅 Scan mode: ${scanType}`);
    if (scanType === 'custom') {
      console.log(`🎯 Custom pattern: ${customPattern}`);
      console.log(`🏷️ Custom service: ${customService}`);
    }
    
    // 设置当前扫描模式，供文件分析时使用
    this.currentScanType = scanType;
    
    // 修复搜索策略 - 移除过严格的日期限制
    let queries = [];
    
    if (scanType === 'custom') {
      // 自定义模式：使用用户提供的搜索模式
      console.log('🎯 Executing CUSTOM scan mode - only custom patterns will be used');
      if (!customPattern) {
        console.error('❌ Custom pattern is required for custom scan mode');
        return;
      }
      
      queries = [
        `"${customPattern}" language:python NOT is:fork`,
        `"${customPattern}" language:javascript NOT is:fork`,
        `"${customPattern}" language:typescript NOT is:fork`,
        `"${customPattern}" language:"Jupyter Notebook" NOT is:fork`,
        `"${customPattern}" language:go NOT is:fork`,
        `"${customPattern}" language:java NOT is:fork`,
        `"${customPattern}" NOT is:fork`, // 通用搜索
      ];
      
      console.log(`📋 Generated ${queries.length} custom search queries`);
      console.log('🚫 Skipping all predefined patterns - using ONLY custom pattern');
      
      // 动态添加自定义正则模式到检测器
      this.addCustomPattern(customPattern, customService);
      
    } else if (scanType === 'file_custom') {
      // 文件定义的自定义模式
      console.log('📄 Executing FILE-BASED custom scan mode');
      
      if (Object.keys(this.fileBasedPatterns).length === 0) {
        console.error('❌ No enabled custom patterns found in custom-patterns.json');
        return;
      }
      
      queries = [];
      Object.values(this.fileBasedPatterns).forEach(pattern => {
        pattern.search_patterns.forEach(searchPattern => {
          queries.push(`"${searchPattern}" language:python NOT is:fork`);
          queries.push(`"${searchPattern}" language:javascript NOT is:fork`);
          queries.push(`"${searchPattern}" language:typescript NOT is:fork`);
          queries.push(`"${searchPattern}" language:"Jupyter Notebook" NOT is:fork`);
          queries.push(`"${searchPattern}" NOT is:fork`);
        });
      });
      
      console.log(`📋 Generated ${queries.length} file-based custom search queries`);
      console.log('🚫 Skipping all predefined patterns - using ONLY file-defined patterns');
      
    } else if (scanType === 'recent') {
      // 最近活跃的仓库扫描 - 使用pushed而不是created
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      queries = [
        // OpenAI系列
        `"sk-" language:python NOT is:fork`,
        `"sk-" language:javascript NOT is:fork`,
        `"sk-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-proj-" language:python NOT is:fork`,   // OpenAI Project keys
        `"sk-proj-" language:javascript NOT is:fork`,
        `"sk-proj-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-user-" language:python NOT is:fork`,   // OpenAI User keys
        `"sk-user-" language:javascript NOT is:fork`,
        `"sk-user-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-svcacct-" language:python NOT is:fork`, // OpenAI Service Account keys
        `"sk-svcacct-" language:javascript NOT is:fork`,
        `"sk-svcacct-" language:"Jupyter Notebook" NOT is:fork`,
        // 新增AI服务 - 更精确的搜索
        `"sk-or-" language:python NOT is:fork`,     // OpenRouter (更广泛)
        `"sk-or-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-or-v1-" language:python NOT is:fork`,  // OpenRouter (原有)
        `"pplx-" language:python NOT is:fork`,      // Perplexity
        `"gsk_" language:python NOT is:fork`,       // Groq
        `"gsk_" language:"Jupyter Notebook" NOT is:fork`,
        `"fw_" language:python NOT is:fork`,        // Fireworks
        `"pa-" language:python NOT is:fork`,        // Voyage AI
        `"esecret_" language:python NOT is:fork`,   // Anyscale
        // Google系列 - 精确搜索
        `"AIza" language:python NOT is:fork`,
        `"AIza" language:"Jupyter Notebook" NOT is:fork`,
        `"AIzaSy" language:python NOT is:fork`,     // Google精确格式
        // FAL.AI搜索
        `"FAL_KEY" language:python NOT is:fork`,
        `"fal.ai" language:python NOT is:fork`,
        // HuggingFace & Replicate
        `"hf_" language:python NOT is:fork`,
        `"hf_" language:"Jupyter Notebook" NOT is:fork`,
        `"r8_" language:python NOT is:fork`,
        // API Key变量名搜索
        `openai_api_key language:python`,
        `openai_api_key language:"Jupyter Notebook"`,
        `anthropic_api_key language:python`,
        `anthropic_api_key language:"Jupyter Notebook"`,
        `openrouter_api_key language:python`,
        `groq_api_key language:python`,
        `groq_api_key language:"Jupyter Notebook"`,
        // 最近推送的仓库
        `"sk-" pushed:>${yesterday} NOT is:fork`,
        `"sk-proj-" pushed:>${yesterday} NOT is:fork`,
        `"sk-user-" pushed:>${yesterday} NOT is:fork`,
        `"sk-svcacct-" pushed:>${yesterday} NOT is:fork`,
        `"AIza" pushed:>${yesterday} NOT is:fork`,
      ];
    } else if (scanType === 'full') {
      // 全面扫描 - 使用更广泛的搜索
      queries = [
        // OpenAI系列
        `"sk-" language:python NOT is:fork`,
        `"sk-" language:javascript NOT is:fork`,
        `"sk-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-proj-" language:python NOT is:fork`,   // OpenAI Project keys
        `"sk-proj-" language:javascript NOT is:fork`,
        `"sk-proj-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-user-" language:python NOT is:fork`,   // OpenAI User keys
        `"sk-user-" language:javascript NOT is:fork`,
        `"sk-user-" language:"Jupyter Notebook" NOT is:fork`,
        `"sk-svcacct-" language:python NOT is:fork`, // OpenAI Service Account keys
        `"sk-svcacct-" language:javascript NOT is:fork`,
        `"sk-svcacct-" language:"Jupyter Notebook" NOT is:fork`,
        // 新增AI服务特征搜索 - 精确模式
        `"sk-or-" NOT is:fork`,                 // OpenRouter (更广泛)
        `"sk-or-v1" NOT is:fork`,               // OpenRouter (原有)
        `"pplx-" NOT is:fork`,                  // Perplexity
        `"gsk_" NOT is:fork`,                   // Groq
        `"fw_" NOT is:fork`,                    // Fireworks
        `"esecret_" NOT is:fork`,               // Anyscale
        `"pa-" NOT is:fork`,                    // Voyage AI
        // Google系列 - 精确搜索
        `"AIza" language:python NOT is:fork`,
        `"AIzaSy" NOT is:fork`,                 // Google精确格式
        // FAL.AI搜索
        `"FAL_KEY" NOT is:fork`,
        `"fal.ai" NOT is:fork`,
        // Anthropic精确搜索
        `"sk-ant-api03" NOT is:fork`,  
        // HuggingFace & Replicate
        `"hf_" language:python NOT is:fork`,
        `"r8_" language:python NOT is:fork`,
        // 通用API Key搜索
        `"api_key" language:python`,
        `"OPENAI_API_KEY" NOT is:fork`,
        `"ANTHROPIC_API_KEY" NOT is:fork`,
        `"GROQ_API_KEY" NOT is:fork`,
        `"OPENROUTER_API_KEY" NOT is:fork`,
        // 导入语句搜索
        `"import openai" language:python`,
        `"from anthropic" language:python`,
        `"import groq" language:python`,
        // 文件扩展名搜索
        `sk- extension:py NOT is:fork`,
        `sk- extension:js NOT is:fork`,
        `sk- extension:ipynb NOT is:fork`,
        `sk-proj- extension:py NOT is:fork`,
        `sk-proj- extension:js NOT is:fork`,
        `sk-proj- extension:ipynb NOT is:fork`,
        `sk-user- extension:py NOT is:fork`,
        `sk-user- extension:js NOT is:fork`,
        `sk-user- extension:ipynb NOT is:fork`,
        `sk-svcacct- extension:py NOT is:fork`,
        `sk-svcacct- extension:js NOT is:fork`,
        `sk-svcacct- extension:ipynb NOT is:fork`,
        `AIza extension:py NOT is:fork`,
        `AIza extension:ipynb NOT is:fork`,
        `hf_ extension:py NOT is:fork`,
        `hf_ extension:ipynb NOT is:fork`,
        // 配置文件搜索
        `"sk-" filename:.env`,
        `"sk-proj-" filename:.env`,
        `"sk-user-" filename:.env`,
        `"sk-svcacct-" filename:.env`,
        `"OPENAI_API_KEY" filename:.env`,
        `"ANTHROPIC_API_KEY" filename:.env`,
        `"GROQ_API_KEY" filename:.env`,
      ];
    } else {
      console.error(`❌ Unknown scan type: ${scanType}`);
      console.log('✅ Valid scan types: custom, recent, full, file_custom');
      return;
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
      
      let totalProcessed = 0;
      let currentPage = 1;
      const maxPages = this.paginationConfig.enabled ? this.paginationConfig.maxPages : 1;
      
      while (currentPage <= maxPages) {
        console.log(`📄 Processing page ${currentPage}/${maxPages}...`);
        
        const results = await this.octokit.rest.search.code({
          q: query,
          per_page: this.paginationConfig.perPage,
          page: currentPage,
          sort: 'indexed'
        });

        const totalCount = results.data.total_count;
        const currentPageItems = results.data.items.length;
        totalProcessed += currentPageItems;

        if (currentPage === 1) {
          console.log(`📄 Found ${currentPageItems} files on page 1 (total available: ${totalCount})`);
        } else {
          console.log(`📄 Found ${currentPageItems} files on page ${currentPage} (processed so far: ${totalProcessed})`);
        }

        if (currentPageItems === 0) {
          console.log(`⚠️  No results on page ${currentPage} for query: ${query}`);
          break;
        }

        for (const item of results.data.items) {
          this.scannedToday++;
          console.log(`🔍 Analyzing: ${item.repository.full_name}/${item.path} (page ${currentPage})`);
          await this.analyzeFile(item);
          await this.sleep(800); // 分析文件间的延迟
        }

        // 如果分页未启用或已达到最后一页，退出
        if (!this.paginationConfig.enabled || currentPageItems < this.paginationConfig.perPage) {
          break;
        }

        // 页面间延迟，避免API限流
        if (currentPage < maxPages) {
          console.log(`⏳ Waiting 3s before next page...`);
          await this.sleep(3000);
        }

        currentPage++;
      }

      if (this.paginationConfig.enabled && totalProcessed > 0) {
        console.log(`✅ Completed processing ${totalProcessed} files across ${currentPage} pages for query: ${query}`);
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

      let fileContent = Buffer.from(content.data.content, 'base64').toString();
      
      // Jupyter Notebook 特殊处理
      if (fileInfo.path.endsWith('.ipynb')) {
        fileContent = this.extractNotebookContent(fileContent, fileInfo.path);
      }
      
      // 检测各种API密钥 - 根据扫描模式选择使用的模式
      let allPatterns;
      
      if (this.currentScanType === 'custom') {
        // custom模式：只使用动态添加的自定义模式
        allPatterns = { ...this.customPatterns };
        console.log(`🔍 Using ONLY custom patterns for detection (${Object.keys(allPatterns).length} patterns)`);
      } else if (this.currentScanType === 'file_custom') {
        // file_custom模式：只使用文件定义的模式
        allPatterns = { ...this.fileBasedPatterns };
        console.log(`🔍 Using ONLY file-based patterns for detection (${Object.keys(allPatterns).length} patterns)`);
      } else {
        // 其他模式：使用所有模式
        allPatterns = { ...KEY_PATTERNS, ...this.customPatterns, ...this.fileBasedPatterns };
        console.log(`🔍 Using ALL patterns for detection (${Object.keys(allPatterns).length} patterns)`);
      }
      
      for (const [type, config] of Object.entries(allPatterns)) {
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
    // 获取密钥类型配置 - 根据当前扫描模式决定查找范围
    let keyConfig;
    
    if (this.currentScanType === 'custom') {
      keyConfig = this.customPatterns[type];
    } else if (this.currentScanType === 'file_custom') {
      keyConfig = this.fileBasedPatterns[type];
    } else {
      keyConfig = KEY_PATTERNS[type] || this.customPatterns[type] || this.fileBasedPatterns[type];
    }
    
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

      // 自动验证新发现的密钥
      await this.autoVerifyKey(keyRecord.id, type, key);
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
    
    // 获取密钥配置中的上下文要求 - 根据当前扫描模式决定查找范围
    let keyConfig;
    
    if (this.currentScanType === 'custom') {
      keyConfig = this.customPatterns[type];
    } else if (this.currentScanType === 'file_custom') {
      keyConfig = this.fileBasedPatterns[type];
    } else {
      keyConfig = KEY_PATTERNS[type] || this.customPatterns[type] || this.fileBasedPatterns[type];
    }
    const requiredContexts = keyConfig?.context_required || [];
    
    // 如果没有上下文要求，直接通过
    if (requiredContexts.length === 0) return true;
    
    // 检查是否包含必需的上下文关键词
    return requiredContexts.some(ctx => context.includes(ctx.toLowerCase()));
  }

  async autoVerifyKey(keyId, keyType, fullKey) {
    try {
      console.log(`🔍 Auto-verifying ${keyType} key ${keyId}...`);

      // 调用验证API
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({
          keyType: keyType,
          key: fullKey
        })
      });

      if (!response.ok) {
        // 如果API endpoint不可用，使用本地验证逻辑
        const verificationResult = await this.localVerifyKey(keyType, fullKey);
        
        // 检查是否为不支持的密钥类型
        if (verificationResult.isValid === 'unsupported') {
          console.log(`⚠️ Auto-verification skipped for key ${keyId} (${keyType}) - not supported`);
          return; // 不更新状态，保持 unknown
        }
        
        await this.updateKeyStatus(keyId, verificationResult.isValid);
        console.log(`✅ Auto-verification completed for key ${keyId}: ${verificationResult.isValid ? 'valid' : 'invalid'}`);
        return;
      }

      const result = await response.json();
      await this.updateKeyStatus(keyId, result.isValid);
      console.log(`✅ Auto-verification completed for key ${keyId}: ${result.isValid ? 'valid' : 'invalid'}`);

    } catch (error) {
      console.error(`❌ Auto-verification failed for key ${keyId}:`, error.message);
      // 验证失败时，保持状态为 unknown
    }
  }

  async localVerifyKey(keyType, key) {
    // 简化的本地验证逻辑（避免外部API依赖）
    try {
      switch (keyType.toLowerCase()) {
        case 'openai':
        case 'openai_org':
        case 'deepseek':
          return await this.verifyOpenAI(key);
        case 'anthropic':
          return await this.verifyAnthropic(key);
        case 'google':
        case 'google_service':
        case 'palm':
        case 'gemini':
          return await this.verifyGoogle(key);
        case 'huggingface':
          return await this.verifyHuggingFace(key);
        case 'replicate':
          return await this.verifyReplicate(key);
        case 'together':
          return await this.verifyTogether(key);
        case 'openrouter':
          return await this.verifyOpenRouter(key);
        case 'perplexity':
          return await this.verifyPerplexity(key);
        case 'groq':
          return await this.verifyGroq(key);
        default:
          // 不支持自动验证的服务
          return { isValid: 'unsupported', message: '暂不支持该服务的自动验证' };
      }
    } catch (error) {
      return { isValid: false, message: '验证过程中发生错误' };
    }
  }

  async verifyOpenAI(key) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async verifyAnthropic(key) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 
          'x-api-key': key,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        })
      });
      return { isValid: response.status !== 401 && response.status !== 403 };
    } catch {
      return { isValid: false };
    }
  }

  async verifyGoogle(key) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async verifyHuggingFace(key) {
    try {
      const response = await fetch('https://huggingface.co/api/whoami', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async verifyReplicate(key) {
    try {
      const response = await fetch('https://api.replicate.com/v1/account', {
        headers: { 'Authorization': `Token ${key}` }
      });
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async verifyTogether(key) {
    try {
      const response = await fetch('https://api.together.xyz/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async verifyOpenRouter(key) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async verifyPerplexity(key) {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        })
      });
      return { isValid: response.status !== 401 && response.status !== 403 };
    } catch {
      return { isValid: false };
    }
  }

  async verifyGroq(key) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return { isValid: response.ok };
    } catch {
      return { isValid: false };
    }
  }

  async updateKeyStatus(keyId, isValid) {
    try {
      const { error } = await this.supabase
        .from('leaked_keys')
        .update({
          status: isValid ? 'valid' : 'invalid',
          last_verified: new Date().toISOString()
        })
        .eq('id', keyId);

      if (error) {
        console.error('Failed to update key status:', error);
      }
    } catch (error) {
      console.error('Error updating key status:', error);
    }
  }

  maskKey(key, maxLength = 100) {
    if (key.length <= 8) return '*'.repeat(key.length);
    
    const basicMask = key.substring(0, 6) + '*'.repeat(Math.max(key.length - 12, 4)) + key.substring(key.length - 6);
    
    // If it exceeds maxLength, truncate intelligently
    if (basicMask.length > maxLength) {
      const availableMiddle = maxLength - 12; // 6 chars start + 6 chars end
      const truncatedMask = key.substring(0, 6) + '*'.repeat(Math.max(availableMiddle, 4)) + key.substring(key.length - 6);
      return truncatedMask;
    }
    
    return basicMask;
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

  extractNotebookContent(content, path) {
    try {
      const notebook = JSON.parse(content);
      let extractedContent = [];
      
      // 提取所有 cell 的内容
      if (notebook.cells && Array.isArray(notebook.cells)) {
        for (const cell of notebook.cells) {
          if (cell.source && Array.isArray(cell.source)) {
            // source 是字符串数组，连接成完整内容
            const cellContent = cell.source.join('');
            if (cellContent.trim()) {
              extractedContent.push(cellContent);
            }
          } else if (typeof cell.source === 'string') {
            // 有些情况下 source 是字符串
            if (cell.source.trim()) {
              extractedContent.push(cell.source);
            }
          }
          
          // 也检查 outputs 中的内容（执行结果可能包含API密钥）
          if (cell.outputs && Array.isArray(cell.outputs)) {
            for (const output of cell.outputs) {
              if (output.text && Array.isArray(output.text)) {
                const outputText = output.text.join('');
                if (outputText.trim()) {
                  extractedContent.push(outputText);
                }
              }
            }
          }
        }
      }
      
      const result = extractedContent.join('\n');
      console.log(`📓 Jupyter Notebook processed: ${path} (${extractedContent.length} cells)`);
      return result;
      
    } catch (error) {
      console.log(`⚠️  Failed to parse Jupyter Notebook: ${path} - ${error.message}`);
      // 如果解析失败，返回原始内容
      return content;
    }
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