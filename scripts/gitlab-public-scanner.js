#!/usr/bin/env node

/**
 * GitLab 公开项目扫描器
 * 使用公开API，无需认证令牌
 */

const { createClient } = require('@supabase/supabase-js');

// GitLab API配置
const GITLAB_API_BASE = 'https://gitlab.com/api/v4';

// AI API Key模式
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

class GitLabPublicScanner {
  constructor(config = {}) {
    this.config = config;
    this.supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );
    this.baseHeaders = {
      'User-Agent': 'AI-Key-Monitor/1.0 (Security Research)'
    };
    this.requestCount = 0;
    this.maxRequests = 50; // 限制请求数量避免403
  }

  async getPublicProjects(page = 1) {
    if (this.requestCount >= this.maxRequests) {
      console.log('⚠️  Reached request limit to avoid rate limiting');
      return [];
    }

    const url = `${GITLAB_API_BASE}/projects?visibility=public&order_by=last_activity_at&sort=desc&per_page=20&page=${page}`;
    
    try {
      const response = await fetch(url, { headers: this.baseHeaders });
      this.requestCount++;
      
      if (!response.ok) {
        if (response.status === 403) {
          console.warn(`⚠️  GitLab API rate limited (403) - stopping scan`);
          return [];
        }
        throw new Error(`GitLab API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`📋 Found ${data.length} public projects on page ${page}`);
      
      return data;
    } catch (error) {
      console.error(`GitLab public projects fetch failed:`, error.message);
      return [];
    }
  }

  async searchInProject(project) {
    if (this.requestCount >= this.maxRequests) {
      return [];
    }

    const results = [];
    
    try {
      // 获取项目的文件列表
      const url = `${GITLAB_API_BASE}/projects/${project.id}/repository/tree?recursive=true&per_page=100`;
      const response = await fetch(url, { headers: this.baseHeaders });
      this.requestCount++;
      
      if (!response.ok) {
        if (response.status === 403) {
          console.warn(`⚠️  Rate limited accessing project ${project.name}`);
          return [];
        }
        return [];
      }
      
      const files = await response.json();
      
      // 过滤有趣的文件类型
      const interestingFiles = files.filter(file => 
        file.type === 'blob' && 
        /\.(py|js|json|env|txt|md|yml|yaml)$/i.test(file.name) &&
        file.name.length < 100 // 避免超长文件名
      ).slice(0, 10); // 限制每个项目最多检查10个文件
      
      if (interestingFiles.length === 0) {
        return [];
      }
      
      console.log(`🔍 Scanning ${interestingFiles.length} files in ${project.name}`);
      
      for (const file of interestingFiles) {
        if (this.requestCount >= this.maxRequests) break;
        
        const content = await this.getFileContent(project.id, file.path);
        if (content) {
          const foundKeys = this.scanContent(content, file.path);
          if (foundKeys.length > 0) {
            results.push(...foundKeys.map(key => ({
              ...key,
              project: project,
              file: file
            })));
          }
        }
        
        // 文件间延迟
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.error(`Error scanning project ${project.name}:`, error.message);
    }
    
    return results;
  }

  async getFileContent(projectId, filePath) {
    if (this.requestCount >= this.maxRequests) {
      return null;
    }

    const url = `${GITLAB_API_BASE}/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw?ref=main`;
    
    try {
      const response = await fetch(url, { headers: this.baseHeaders });
      this.requestCount++;
      
      if (!response.ok) {
        return null;
      }
      
      const content = await response.text();
      
      // 限制内容大小
      if (content.length > 100000) {
        return content.substring(0, 100000);
      }
      
      return content;
    } catch (error) {
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
            source: 'gitlab_public'
          });
        }
      }
    }
    
    return results;
  }

  async saveResults(results, projectInfo) {
    for (const result of results) {
      try {
        // 检查是否已存在
        const keyHash = this.hashKey(result.key);
        const { data: existing } = await this.supabase
          .from('leaked_keys')
          .select('id')
          .eq('key_hash', keyHash)
          .single();

        if (existing) {
          console.log(`🔄 Key already exists: ${result.key.substring(0, 10)}...`);
          continue;
        }

        // 保存新发现的密钥
        const { error } = await this.supabase
          .from('leaked_keys')
          .insert({
            service: result.service,
            key_partial: result.key.substring(0, 10) + '...',
            key_hash: keyHash,
            confidence: result.confidence,
            severity: this.calculateSeverity(result),
            status: 'unverified',
            source_url: projectInfo.web_url,
            source_type: 'gitlab_public',
            file_path: result.file_path,
            repository_name: projectInfo.name,
            repository_owner: projectInfo.namespace?.name || 'unknown',
            found_at: new Date().toISOString()
          });

        if (error) {
          console.error('Failed to save result:', error);
        } else {
          console.log(`✅ Saved ${result.service} key from ${projectInfo.name}/${result.file_path}`);
        }

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
    console.log('🔍 Starting GitLab public projects scan...');
    console.log(`📊 Request limit: ${this.maxRequests} requests`);
    
    let totalFound = 0;
    let totalProjects = 0;
    
    try {
      // 扫描前几页的公开项目
      for (let page = 1; page <= 3 && this.requestCount < this.maxRequests; page++) {
        const projects = await this.getPublicProjects(page);
        
        if (projects.length === 0) {
          break;
        }
        
        for (const project of projects) {
          if (this.requestCount >= this.maxRequests) {
            console.log('⚠️  Reached request limit, stopping scan');
            break;
          }
          
          totalProjects++;
          console.log(`\n🔎 [${totalProjects}] Scanning project: ${project.name}`);
          
          const results = await this.searchInProject(project);
          
          if (results.length > 0) {
            console.log(`🔑 Found ${results.length} potential keys in ${project.name}`);
            await this.saveResults(results, project);
            totalFound += results.length;
          }
          
          // 项目间延迟
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
    } catch (error) {
      console.error('Scan error:', error.message);
    }
    
    console.log(`\n✅ GitLab public scan completed:`);
    console.log(`   📋 Projects scanned: ${totalProjects}`);
    console.log(`   🔑 Keys found: ${totalFound}`);
    console.log(`   🌐 API requests used: ${this.requestCount}/${this.maxRequests}`);
    
    return totalFound;
  }
}

// 主函数
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const scanner = new GitLabPublicScanner();
  
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

module.exports = GitLabPublicScanner;