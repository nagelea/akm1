#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file manually
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
      console.log('✅ Loaded environment variables from .env file');
    }
  } catch (e) {
    console.log('⚠️ Could not load .env file:', e.message);
  }
}

loadEnvFile();

async function detectTableStructure() {
  console.log('🔍 检测数据库表结构...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // 查询leaked_keys表结构
    console.log('📋 leaked_keys 表结构:');
    const { data: leakedKeysColumns, error: leakedKeysError } = await supabase
      .rpc('sql', {
        query: `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = 'leaked_keys' 
          ORDER BY ordinal_position;
        `
      });

    if (leakedKeysError) {
      // 备用方法：直接查询数据样本
      console.log('⚠️ 无法查询表结构，获取数据样本...');
      const { data: sampleData, error: sampleError } = await supabase
        .from('leaked_keys')
        .select('*')
        .limit(1);
      
      if (sampleError) {
        console.error('❌ 无法获取样本数据:', sampleError);
      } else if (sampleData && sampleData.length > 0) {
        console.log('📄 leaked_keys 数据样本:');
        const sample = sampleData[0];
        Object.entries(sample).forEach(([key, value]) => {
          const type = typeof value;
          const actualType = value === null ? 'null' : 
                           typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'float') :
                           type;
          console.log(`   ${key}: ${actualType} (示例: ${value})`);
        });
      }
    } else {
      leakedKeysColumns?.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
      });
    }

    // 查询leaked_keys_sensitive表结构
    console.log('\n📋 leaked_keys_sensitive 表结构:');
    const { data: sensitiveColumns, error: sensitiveError } = await supabase
      .rpc('sql', {
        query: `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = 'leaked_keys_sensitive' 
          ORDER BY ordinal_position;
        `
      });

    if (sensitiveError) {
      // 备用方法
      const { data: sensitiveSample, error: sensitiveSampleError } = await supabase
        .from('leaked_keys_sensitive')
        .select('*')
        .limit(1);
      
      if (sensitiveSampleError) {
        console.error('❌ 无法获取敏感数据样本:', sensitiveSampleError);
      } else if (sensitiveSample && sensitiveSample.length > 0) {
        console.log('📄 leaked_keys_sensitive 数据样本:');
        const sample = sensitiveSample[0];
        Object.entries(sample).forEach(([key, value]) => {
          const type = typeof value;
          const actualType = value === null ? 'null' : 
                           typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'float') :
                           type;
          console.log(`   ${key}: ${actualType} (示例: ${key === 'full_key' ? '***隐藏***' : value})`);
        });
      }
    } else {
      sensitiveColumns?.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
      });
    }

    // 生成正确的函数定义
    console.log('\n🔧 基于检测结果生成正确的函数定义...');
    
    // 简单的数据样本检测
    const { data: idSample } = await supabase
      .from('leaked_keys')
      .select('id')
      .limit(1);
    
    // 获取完整的字段类型信息
    const { data: fullSample } = await supabase
      .from('leaked_keys')
      .select('*')
      .limit(1);
    
    const { data: sensitiveSample } = await supabase
      .from('leaked_keys_sensitive')
      .select('*')
      .limit(1);

    if (fullSample && fullSample.length > 0) {
      const sample = fullSample[0];
      const sensitive = sensitiveSample && sensitiveSample.length > 0 ? sensitiveSample[0] : {};
      
      console.log('\n🔧 生成完全正确的函数定义...');
      
      // 检测每个字段的SQL类型
      const getPostgresType = (value, fieldName) => {
        if (value === null) return 'TEXT'; // 默认为TEXT
        
        switch (typeof value) {
          case 'number':
            return Number.isInteger(value) ? 'INTEGER' : 'DOUBLE PRECISION';
          case 'boolean':
            return 'BOOLEAN';
          case 'string':
            // 检测时间戳 - 根据实际错误，使用TIMESTAMP而不是TIMESTAMPTZ
            if (fieldName.includes('_at') || fieldName.includes('_seen') || fieldName.includes('verified')) {
              return 'TIMESTAMP';  // 修正：使用TIMESTAMP而不是TIMESTAMPTZ
            }
            // 对于长文本字段，使用TEXT类型
            if (fieldName.includes('context') || fieldName.includes('raw_') || value.length > 255) {
              return 'TEXT';
            }
            return 'VARCHAR';
          default:
            return 'TEXT';
        }
      };
      
      // 生成正确的函数定义
      const functionDef = `
-- 完全正确的函数定义（基于实际数据类型检测）
DROP FUNCTION IF EXISTS get_keys_paginated(integer,integer,text,text,text,text,text);

CREATE OR REPLACE FUNCTION get_keys_paginated(
  page_offset INTEGER DEFAULT 0,
  page_size INTEGER DEFAULT 20,
  search_query TEXT DEFAULT '',
  filter_key_type TEXT DEFAULT 'all',
  filter_severity TEXT DEFAULT 'all',
  filter_confidence TEXT DEFAULT 'all',
  filter_status TEXT DEFAULT 'all'
)
RETURNS TABLE (
  total_count BIGINT,
  id ${getPostgresType(sample.id, 'id')},
  key_type ${getPostgresType(sample.key_type, 'key_type')},
  key_preview ${getPostgresType(sample.key_preview, 'key_preview')},
  severity ${getPostgresType(sample.severity, 'severity')},
  confidence ${getPostgresType(sample.confidence, 'confidence')},
  status ${getPostgresType(sample.status, 'status')},
  repo_name ${getPostgresType(sample.repo_name, 'repo_name')},
  file_path ${getPostgresType(sample.file_path, 'file_path')},
  repo_language ${getPostgresType(sample.repo_language, 'repo_language')},
  first_seen ${getPostgresType(sample.first_seen, 'first_seen')},
  last_verified ${getPostgresType(sample.last_verified, 'last_verified')},
  context_preview ${getPostgresType(sample.context_preview, 'context_preview')},
  full_key ${getPostgresType(sensitive.full_key, 'full_key')},
  raw_context ${getPostgresType(sensitive.raw_context, 'raw_context')},
  github_url ${getPostgresType(sensitive.github_url, 'github_url')}
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- ... 函数体保持不变
$$;
      `;
      
      console.log('📋 字段类型检测结果:');
      console.log(`   id: ${getPostgresType(sample.id, 'id')}`);
      console.log(`   key_type: ${getPostgresType(sample.key_type, 'key_type')}`);
      console.log(`   key_preview: ${getPostgresType(sample.key_preview, 'key_preview')}`);
      console.log(`   severity: ${getPostgresType(sample.severity, 'severity')}`);
      console.log(`   confidence: ${getPostgresType(sample.confidence, 'confidence')}`);
      console.log(`   status: ${getPostgresType(sample.status, 'status')}`);
      console.log(`   repo_name: ${getPostgresType(sample.repo_name, 'repo_name')}`);
      console.log(`   file_path: ${getPostgresType(sample.file_path, 'file_path')}`);
      console.log(`   repo_language: ${getPostgresType(sample.repo_language, 'repo_language')}`);
      console.log(`   first_seen: ${getPostgresType(sample.first_seen, 'first_seen')}`);
      console.log(`   last_verified: ${getPostgresType(sample.last_verified, 'last_verified')}`);
      console.log(`   context_preview: ${getPostgresType(sample.context_preview, 'context_preview')}`);
      
      if (sensitive.full_key !== undefined) {
        console.log(`   full_key: ${getPostgresType(sensitive.full_key, 'full_key')}`);
        console.log(`   raw_context: ${getPostgresType(sensitive.raw_context, 'raw_context')}`);
        console.log(`   github_url: ${getPostgresType(sensitive.github_url, 'github_url')}`);
      }
      
      console.log('\n📝 建议：创建auto-detected-pagination-fix.sql文件使用检测到的正确类型');
    }

  } catch (error) {
    console.error('❌ 检测失败:', error.message);
  }
}

// 运行检测
detectTableStructure();