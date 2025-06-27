#!/usr/bin/env node

/**
 * 多数据源API密钥扫描器
 * 统一管理多个数据源的扫描任务
 */

const { createClient } = require('@supabase/supabase-js');

class MultiSourceScanner {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.scanners = new Map();
    this.results = {
      total: 0,
      bySources: {},
      byServices: {},
      errors: []
    };
  }

  // 注册扫描器
  registerScanner(name, scannerClass, config = {}) {
    this.scanners.set(name, {
      class: scannerClass,
      config: config,
      enabled: config.enabled !== false
    });
    
    console.log(`📝 Registered scanner: ${name}`);
  }

  // 运行单个扫描器
  async runScanner(name) {
    const scannerInfo = this.scanners.get(name);
    
    if (!scannerInfo || !scannerInfo.enabled) {
      console.log(`⏭️  Skipping disabled scanner: ${name}`);
      return 0;
    }

    console.log(`\n🚀 Starting ${name} scanner...`);
    
    try {
      const scanner = new scannerInfo.class(scannerInfo.config);
      const startTime = Date.now();
      
      const count = await scanner.scan();
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${name} completed in ${(duration/1000).toFixed(1)}s, found ${count} keys`);
      
      // 更新统计
      this.results.total += count;
      this.results.bySources[name] = count;
      
      return count;
    } catch (error) {
      console.error(`❌ ${name} scanner failed:`, error.message);
      this.results.errors.push({ source: name, error: error.message });
      return 0;
    }
  }

  // 运行所有扫描器
  async runAll(parallel = false) {
    console.log('🔍 Starting multi-source scan...');
    console.log(`📊 Registered scanners: ${Array.from(this.scanners.keys()).join(', ')}`);
    
    const enabledScanners = Array.from(this.scanners.keys())
      .filter(name => this.scanners.get(name).enabled);
    
    if (enabledScanners.length === 0) {
      console.log('⚠️  No enabled scanners found');
      return this.results;
    }

    const startTime = Date.now();

    if (parallel) {
      // 并行执行(可能触发率限制)
      console.log('⚡ Running scanners in parallel...');
      const promises = enabledScanners.map(name => this.runScanner(name));
      await Promise.allSettled(promises);
    } else {
      // 串行执行(推荐)
      console.log('🔄 Running scanners sequentially...');
      for (const name of enabledScanners) {
        await this.runScanner(name);
        
        // 扫描器之间的延迟
        if (enabledScanners.indexOf(name) < enabledScanners.length - 1) {
          console.log('⏸️  Waiting 30s before next scanner...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    
    // 保存扫描统计
    await this.saveScanStats(totalDuration);
    
    // 显示最终报告
    this.printReport(totalDuration);
    
    return this.results;
  }

  async saveScanStats(duration) {
    try {
      const { error } = await this.supabase
        .from('scan_sessions')
        .insert({
          scan_type: 'multi_source',
          sources: Object.keys(this.results.bySources),
          total_found: this.results.total,
          duration_ms: duration,
          results_breakdown: this.results.bySources,
          errors: this.results.errors,
          completed_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to save scan stats:', error);
      }
    } catch (error) {
      console.error('Error saving scan stats:', error);
    }
  }

  printReport(duration) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 MULTI-SOURCE SCAN REPORT');
    console.log('='.repeat(50));
    console.log(`⏱️  Total Duration: ${(duration/1000/60).toFixed(1)} minutes`);
    console.log(`🔑 Total Keys Found: ${this.results.total}`);
    console.log(`📋 Sources Scanned: ${Object.keys(this.results.bySources).length}`);
    
    if (Object.keys(this.results.bySources).length > 0) {
      console.log('\n📈 Results by Source:');
      for (const [source, count] of Object.entries(this.results.bySources)) {
        console.log(`   ${source}: ${count} keys`);
      }
    }
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const error of this.results.errors) {
        console.log(`   ${error.source}: ${error.error}`);
      }
    }
    
    console.log('='.repeat(50));
  }
}

// 基础扫描器接口
class BaseScanner {
  constructor(config = {}) {
    this.config = config;
    this.supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  async scan() {
    throw new Error('Subclasses must implement scan() method');
  }

  // 通用的密钥保存逻辑
  async saveKey(keyData) {
    try {
      const keyHash = this.hashKey(keyData.key);
      
      // 检查重复
      const { data: existing } = await this.supabase
        .from('leaked_keys')
        .select('id')
        .eq('key_hash', keyHash)
        .single();

      if (existing) {
        return false; // 已存在
      }

      // 保存新密钥
      const { error } = await this.supabase
        .from('leaked_keys')
        .insert({
          service: keyData.service,
          key_partial: keyData.key.substring(0, 10) + '...',
          key_hash: keyHash,
          confidence: keyData.confidence || 'medium',
          severity: keyData.severity || 'medium',
          status: 'unverified',
          source_url: keyData.source_url,
          source_type: keyData.source_type,
          file_path: keyData.file_path,
          repository_name: keyData.repository_name,
          repository_owner: keyData.repository_owner,
          found_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to save key:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving key:', error);
      return false;
    }
  }

  hashKey(key) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

// GitHub Gist扫描器示例
class GitHubGistScanner extends BaseScanner {
  async scan() {
    const { Octokit } = require('@octokit/rest');
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    let totalFound = 0;
    const searchTerms = ['sk-', 'AIza', 'sk-ant-'];

    for (const term of searchTerms) {
      try {
        console.log(`🔎 Searching GitHub Gists for: ${term}`);
        
        // GitHub Gist搜索
        const { data } = await octokit.rest.search.code({
          q: `${term} filename:*.py OR filename:*.js OR filename:*.json`,
          sort: 'indexed',
          per_page: 30
        });

        for (const item of data.items) {
          if (item.html_url.includes('gist.github.com')) {
            // 处理Gist特定逻辑
            const found = await this.processGist(item);
            totalFound += found;
            
            // API限制延迟
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (error) {
        console.error(`Gist search failed for "${term}":`, error.message);
      }
    }

    return totalFound;
  }

  async processGist(item) {
    // Gist处理逻辑
    console.log(`📝 Processing Gist: ${item.html_url}`);
    
    // 这里添加具体的Gist内容获取和密钥检测逻辑
    // ...
    
    return 0; // 返回找到的密钥数量
  }
}

// 使用示例
async function main() {
  const scanner = new MultiSourceScanner();
  
  // 注册不同的扫描器
  scanner.registerScanner('github_gist', GitHubGistScanner, {
    enabled: true,
    rateLimit: 2000 // ms between requests
  });
  
  // 如果GitLab扫描器可用
  try {
    // 优先使用公开扫描器（无需认证）
    const GitLabPublicScanner = require('./gitlab-public-scanner');
    scanner.registerScanner('gitlab_public', GitLabPublicScanner, {
      enabled: process.env.ENABLE_GITLAB_SCAN !== 'false' // 默认启用
    });
  } catch (error) {
    console.log('GitLab public scanner not available:', error.message);
    
    // 回退到需要认证的版本
    try {
      const GitLabScanner = require('./gitlab-scanner');
      scanner.registerScanner('gitlab', GitLabScanner, {
        enabled: !!process.env.GITLAB_TOKEN // 只有在有token时启用
      });
    } catch (fallbackError) {
      console.log('GitLab scanner not available:', fallbackError.message);
    }
  }
  
  // 运行所有扫描器
  const results = await scanner.runAll(false); // 串行执行
  
  console.log(`\n🎉 Scan completed! Total: ${results.total} keys found`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { MultiSourceScanner, BaseScanner };