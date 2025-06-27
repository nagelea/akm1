#!/usr/bin/env node

/**
 * GitLab API Key Scanner
 * 扩展现有GitHub扫描器到GitLab平台
 */

const { Octokit } = require('@octokit/rest'); // 重用GitHub API模式
const { createClient } = require('@supabase/supabase-js');

// GitLab API配置
const GITLAB_API_BASE = 'https://gitlab.com/api/v4';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN; // 可选，提高速率限制

// AI API Key模式 (重用现有模式)
const KEY_PATTERNS = {
  openai: {
    pattern: /\b(sk-[a-zA-Z0-9]{48}|sk-proj-[a-zA-Z0-9]{64})\b/g,
    confidence: 'high',
    service: 'OpenAI'
  },
  anthropic: {
    pattern: /\bsk-ant-[a-zA-Z0-9]{95}\b/g,
    confidence: 'high', 
    service: 'Anthropic'
  },
  google_ai: {
    pattern: /\bAIza[a-zA-Z0-9]{35}\b/g,
    confidence: 'high',
    service: 'Google AI'
  }
};

class GitLabScanner {
  constructor(config = {}) {
    this.config = config;
    this.supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );
    this.baseHeaders = {
      'User-Agent': 'AI-Key-Monitor/1.0 (Security Research)',
      ...(GITLAB_TOKEN && { 'Authorization': `Bearer ${GITLAB_TOKEN}` })
    };
  }

  async searchProjects(query, page = 1) {
    const url = `${GITLAB_API_BASE}/search?scope=blobs&search=${encodeURIComponent(query)}&per_page=20&page=${page}`;
    
    try {
      const response = await fetch(url, { headers: this.baseHeaders });
      
      if (!response.ok) {
        if (response.status === 403) {
          console.warn(`⚠️  GitLab API 403 Forbidden for "${query}" - consider setting GITLAB_TOKEN for higher rate limits`);
          return [];
        }
        throw new Error(`GitLab API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`GitLab search for "${query}": ${data.length} results on page ${page}`);
      
      return data;
    } catch (error) {
      console.error(`GitLab search failed for "${query}":`, error.message);
      return [];
    }
  }

  async getFileContent(projectId, filePath, ref = 'main') {
    const url = `${GITLAB_API_BASE}/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${ref}`;
    
    try {
      const response = await fetch(url, { headers: this.baseHeaders });
      
      if (!response.ok) {
        return null;
      }
      
      return await response.text();
    } catch (error) {
      console.error(`Failed to get GitLab file content:`, error.message);
      return null;
    }
  }

  scanContent(content, filePath) {
    const results = [];
    
    for (const [keyType, config] of Object.entries(KEY_PATTERNS)) {
      const matches = content.match(config.pattern);
      
      if (matches) {
        for (const match of matches) {
          results.push({
            key: match,
            service: config.service,
            confidence: config.confidence,
            file_path: filePath,
            pattern_type: keyType,
            source: 'gitlab'
          });
        }
      }
    }
    
    return results;
  }

  async saveResults(results, projectInfo) {
    for (const result of results) {
      try {
        // 检查是否已存在(避免重复)
        const { data: existing } = await this.supabase
          .from('leaked_keys')
          .select('id')
          .eq('key_hash', this.hashKey(result.key))
          .single();

        if (existing) {
          console.log(`Key already exists: ${result.key.substring(0, 10)}...`);
          continue;
        }

        // 保存新发现的密钥
        const { error } = await this.supabase
          .from('leaked_keys')
          .insert({
            service: result.service,
            key_partial: result.key.substring(0, 10) + '...',
            key_hash: this.hashKey(result.key),
            confidence: result.confidence,
            severity: this.calculateSeverity(result),
            status: 'unverified',
            source_url: projectInfo.web_url,
            source_type: 'gitlab_project',
            file_path: result.file_path,
            repository_name: projectInfo.name,
            repository_owner: projectInfo.namespace?.name || 'unknown',
            found_at: new Date().toISOString()
          });

        if (error) {
          console.error('Failed to save result:', error);
        } else {
          console.log(`✅ Saved ${result.service} key from ${projectInfo.name}`);
        }

        // 延迟避免数据库压力
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('Error saving result:', error);
      }
    }
  }

  hashKey(key) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  calculateSeverity(result) {
    if (result.confidence === 'high') return 'high';
    if (result.confidence === 'medium') return 'medium';
    return 'low';
  }

  async scan() {
    console.log('🔍 Starting GitLab scan...');
    
    const searchTerms = ['sk-', 'sk-ant-', 'AIza'];
    let totalFound = 0;
    
    for (const term of searchTerms) {
      console.log(`\n🔎 Searching GitLab for: ${term}`);
      
      try {
        const results = await this.searchProjects(term);
        
        for (const item of results) {
          // 获取项目信息
          const projectUrl = `${GITLAB_API_BASE}/projects/${item.project_id}`;
          const projectResponse = await fetch(projectUrl, { headers: this.baseHeaders });
          const projectInfo = await projectResponse.json();
          
          // 获取文件内容
          const content = await this.getFileContent(item.project_id, item.path);
          
          if (content) {
            const foundKeys = this.scanContent(content, item.path);
            
            if (foundKeys.length > 0) {
              console.log(`🔑 Found ${foundKeys.length} potential keys in ${projectInfo.name}/${item.path}`);
              await this.saveResults(foundKeys, projectInfo);
              totalFound += foundKeys.length;
            }
          }
          
          // 延迟避免API限制
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Error scanning term "${term}":`, error.message);
      }
    }
    
    console.log(`\n✅ GitLab scan completed. Found ${totalFound} potential keys.`);
    return totalFound;
  }
}

// 主函数
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const scanner = new GitLabScanner();
  
  try {
    await scanner.scan();
  } catch (error) {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = GitLabScanner;