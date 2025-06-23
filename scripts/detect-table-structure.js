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
    
    if (idSample && idSample.length > 0) {
      const idValue = idSample[0].id;
      const idType = typeof idValue === 'number' ? 'INTEGER' : 'UUID';
      
      console.log(`✅ 检测到 id 类型: ${idType} (示例值: ${idValue})`);
      
      const functionDef = `
-- 正确的函数定义（基于检测结果）
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
  id ${idType},  -- 检测到的正确类型
  key_type TEXT,
  key_preview TEXT,
  severity TEXT,
  confidence TEXT,
  status TEXT,
  repo_name TEXT,
  file_path TEXT,
  repo_language TEXT,
  first_seen TIMESTAMPTZ,
  last_verified TIMESTAMPTZ,
  context_preview TEXT,
  full_key TEXT,
  raw_context TEXT,
  github_url TEXT
) 
-- ... 其余函数体保持不变
      `;
      
      console.log('📝 建议的函数定义已生成，请使用检测到的类型修复函数');
    }

  } catch (error) {
    console.error('❌ 检测失败:', error.message);
  }
}

// 运行检测
detectTableStructure();