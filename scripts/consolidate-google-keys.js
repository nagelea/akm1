#!/usr/bin/env node

/**
 * Google 密钥类型整合脚本
 * 将重复的 google, palm, gemini 类型合并为统一的 google_api 类型
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 手动加载环境变量
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          if (key && value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      console.log('✅ 已加载环境变量');
    }
  } catch (e) {
    console.log('⚠️ 无法加载 .env 文件:', e.message);
  }
}

loadEnvFile();

class GoogleKeyConsolidator {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.stats = {
      total: 0,
      consolidated: 0,
      duplicatesRemoved: 0,
      errors: 0,
      typeMapping: {
        google: 0,
        palm: 0,
        gemini: 0,
        google_precise: 0
      }
    };
  }

  async run() {
    console.log('🔄 开始整合 Google 相关密钥类型...\n');
    
    try {
      // 获取所有需要整合的 Google 密钥类型
      const typesToConsolidate = ['google', 'palm', 'gemini', 'google_precise'];
      
      for (const keyType of typesToConsolidate) {
        console.log(`🔍 处理 ${keyType} 类型密钥...`);
        
        const { data: keys, error } = await this.supabase
          .from('leaked_keys')
          .select(`
            id,
            key_type,
            key_preview,
            repo_name,
            file_path,
            context_preview,
            confidence,
            created_at,
            leaked_keys_sensitive!inner(
              id,
              full_key,
              raw_context,
              github_url
            )
          `)
          .eq('key_type', keyType)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(`查询 ${keyType} 失败: ${error.message}`);
        }

        console.log(`  📊 找到 ${keys.length} 个 ${keyType} 密钥`);
        this.stats.total += keys.length;
        this.stats.typeMapping[keyType] = keys.length;

        // 处理每个密钥
        await this.processKeysOfType(keys, keyType);
      }

      // 检查并移除重复密钥
      await this.removeDuplicateGoogleKeys();

      this.printSummary();

    } catch (error) {
      console.error('❌ 整合过程出错:', error.message);
    }
  }

  async processKeysOfType(keys, oldType) {
    for (let i = 0; i < keys.length; i++) {
      const keyRecord = keys[i];
      console.log(`  🔄 更新 ${i + 1}/${keys.length}: 密钥 ${keyRecord.id} (${oldType} → google_api)`);
      
      try {
        // 更新密钥类型为 google_api
        const { error: updateError } = await this.supabase
          .from('leaked_keys')
          .update({
            key_type: 'google_api'
          })
          .eq('id', keyRecord.id);

        if (updateError) {
          throw new Error(`更新密钥 ${keyRecord.id} 失败: ${updateError.message}`);
        }

        this.stats.consolidated++;

      } catch (error) {
        console.error(`  ❌ 处理密钥 ${keyRecord.id} 时出错:`, error.message);
        this.stats.errors++;
      }
    }
  }

  async removeDuplicateGoogleKeys() {
    console.log('\n🔍 检查并移除重复的 Google API 密钥...');
    
    try {
      // 查找可能的重复密钥（相同的 full_key）
      const { data: duplicates, error } = await this.supabase
        .from('leaked_keys')
        .select(`
          id,
          key_preview,
          created_at,
          leaked_keys_sensitive!inner(
            id,
            full_key
          )
        `)
        .eq('key_type', 'google_api')
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`查询重复密钥失败: ${error.message}`);
      }

      // 按 full_key 分组找到重复项
      const keyGroups = {};
      duplicates.forEach(record => {
        const fullKey = record.leaked_keys_sensitive[0]?.full_key;
        if (fullKey) {
          if (!keyGroups[fullKey]) {
            keyGroups[fullKey] = [];
          }
          keyGroups[fullKey].push(record);
        }
      });

      // 删除重复项（保留最早的记录）
      for (const [fullKey, records] of Object.entries(keyGroups)) {
        if (records.length > 1) {
          console.log(`  🔍 发现重复密钥: ${records[0].key_preview} (${records.length} 个重复)`);
          
          // 保留最早的记录，删除其他的
          const toDelete = records.slice(1);
          
          for (const record of toDelete) {
            await this.deleteKeyRecord(record);
            this.stats.duplicatesRemoved++;
            console.log(`    🗑️ 已删除重复记录: ${record.id}`);
          }
        }
      }

    } catch (error) {
      console.error('❌ 移除重复密钥时出错:', error.message);
    }
  }

  async deleteKeyRecord(keyRecord) {
    const { id, leaked_keys_sensitive } = keyRecord;
    const sensitiveId = leaked_keys_sensitive[0]?.id;
    
    try {
      // 删除可能的外键依赖
      await this.supabase.from('access_logs').delete().eq('key_id', id);
      
      // 删除敏感数据记录
      if (sensitiveId) {
        const { error: sensitiveError } = await this.supabase
          .from('leaked_keys_sensitive')
          .delete()
          .eq('id', sensitiveId);

        if (sensitiveError) {
          throw new Error(`删除敏感数据失败: ${sensitiveError.message}`);
        }
      }

      // 删除主记录
      const { error: mainError } = await this.supabase
        .from('leaked_keys')
        .delete()
        .eq('id', id);

      if (mainError) {
        throw new Error(`删除主记录失败: ${mainError.message}`);
      }

    } catch (error) {
      console.error(`删除记录 ${id} 时出错:`, error.message);
      throw error;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Google 密钥类型整合完成');
    console.log('='.repeat(80));
    console.log(`📈 总计处理: ${this.stats.total} 个密钥`);
    console.log(`🔄 已整合: ${this.stats.consolidated} 个`);
    console.log(`🗑️ 移除重复: ${this.stats.duplicatesRemoved} 个`);
    console.log(`❌ 处理错误: ${this.stats.errors} 个`);
    
    console.log('\n📋 类型整合统计:');
    Object.entries(this.stats.typeMapping).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`   ${type}: ${count} 个 → google_api`);
      }
    });
    
    const successRate = this.stats.total > 0 ? 
      (((this.stats.consolidated - this.stats.errors) / this.stats.total) * 100).toFixed(1) : 0;
    
    console.log(`\n📊 整合成功率: ${successRate}%`);
    
    console.log('\n💡 整合结果:');
    console.log('   - ✅ 所有 Google 相关密钥统一为 google_api 类型');
    console.log('   - 🗑️ 移除了重复的密钥记录');
    console.log('   - 🎯 消除了检测冲突和优先级问题');
    console.log('   - 📝 简化了密钥分类和管理');
    
    console.log('\n📢 说明:');
    console.log('   - google_api 包含所有 Google AI API 密钥');
    console.log('   - 支持 Gemini、PaLM、Google AI 等服务');
    console.log('   - 使用统一的验证逻辑');
    
    console.log('='.repeat(80));
  }
}

// 运行整合器
async function main() {
  console.log('⚠️ 这将整合所有 Google 相关密钥类型为统一的 google_api 类型');
  console.log('📋 包括: google, palm, gemini, google_precise → google_api\n');
  
  const consolidator = new GoogleKeyConsolidator();
  await consolidator.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = GoogleKeyConsolidator;