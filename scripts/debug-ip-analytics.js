#!/usr/bin/env node

/**
 * 调试IP分析数据问题
 */

const { createClient } = require('@supabase/supabase-js');

async function debugIPAnalytics() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 调试 IP 分析数据...\n');
  
  try {
    // 1. 检查 visitor_stats 表是否存在数据
    console.log('1. 检查 visitor_stats 表数据:');
    const { data: visitorStats, error: visitorError, count } = await supabase
      .from('visitor_stats')
      .select('ip_address, country, city, created_at', { count: 'exact' })
      .limit(10);
    
    if (visitorError) {
      console.error('❌ visitor_stats 表错误:', visitorError.message);
    } else {
      console.log(`✅ visitor_stats 表有 ${count} 条记录`);
      console.log('最近10条记录:');
      visitorStats.forEach((record, index) => {
        console.log(`  ${index + 1}. IP: ${record.ip_address}, 国家: ${record.country || '未设置'}, 城市: ${record.city || '未设置'}, 时间: ${record.created_at}`);
      });
    }
    
    // 2. 检查有多少IP没有地理位置数据
    console.log('\n2. 检查缺少地理位置的IP:');
    const { data: missingGeo, error: geoError, count: missingCount } = await supabase
      .from('visitor_stats')
      .select('ip_address', { count: 'exact' })
      .is('country', null)
      .neq('ip_address', '127.0.0.1');
    
    if (geoError) {
      console.error('❌ 地理位置检查错误:', geoError.message);
    } else {
      console.log(`⚠️ 有 ${missingCount} 条记录缺少地理位置数据`);
      if (missingCount > 0) {
        const uniqueIPs = [...new Set(missingGeo.map(r => r.ip_address))];
        console.log('需要解析的IP:', uniqueIPs.slice(0, 5).join(', '), uniqueIPs.length > 5 ? `等${uniqueIPs.length}个` : '');
      }
    }
    
    // 3. 检查数据库函数是否存在
    console.log('\n3. 检查数据库函数:');
    const functions = [
      'get_ip_analytics_summary',
      'get_ip_risk_analysis',
      'check_ip_access'
    ];
    
    for (const funcName of functions) {
      try {
        const { data, error } = await supabase.rpc(funcName, { days_back: 1 });
        if (error) {
          console.error(`❌ 函数 ${funcName} 错误:`, error.message);
        } else {
          console.log(`✅ 函数 ${funcName} 正常工作`);
        }
      } catch (err) {
        console.error(`❌ 函数 ${funcName} 不存在或有错误:`, err.message);
      }
    }
    
    // 4. 检查 IP 黑白名单表
    console.log('\n4. 检查 IP 管理表:');
    const tables = ['ip_blacklist', 'ip_whitelist'];
    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.error(`❌ 表 ${table} 错误:`, error.message);
        } else {
          console.log(`✅ 表 ${table} 存在，有 ${count} 条记录`);
        }
      } catch (err) {
        console.error(`❌ 表 ${table} 不存在:`, err.message);
      }
    }
    
    // 5. 测试地理位置解析
    console.log('\n5. 测试IP地理位置解析:');
    if (missingCount > 0) {
      const testIP = missingGeo[0]?.ip_address;
      if (testIP && testIP !== '127.0.0.1') {
        console.log(`测试解析 IP: ${testIP}`);
        try {
          const response = await fetch(`http://ip-api.com/json/${testIP}?fields=status,country,city`);
          const geoData = await response.json();
          console.log('地理位置API返回:', geoData);
        } catch (err) {
          console.error('地理位置API测试失败:', err.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  }
}

if (require.main === module) {
  debugIPAnalytics();
}