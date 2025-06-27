#!/usr/bin/env node

/**
 * 手动解析IP地理位置并更新数据库
 */

const { createClient } = require('@supabase/supabase-js');

// IP地理位置解析
async function getIPLocation(ip) {
  try {
    // 跳过本地IP
    if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return null
    }
    
    console.log(`正在解析 IP: ${ip}`)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,timezone,isp,org`, {
      timeout: 10000
    })
    
    if (!response.ok) {
      console.log(`❌ IP ${ip} API请求失败: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    console.log(`API 返回 (${ip}):`, data)
    
    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        region: data.regionName || 'Unknown',
        city: data.city || 'Unknown',
        timezone: data.timezone || 'Unknown',
        isp: data.isp || 'Unknown',
        org: data.org || 'Unknown'
      }
    }
    
    console.log(`❌ IP ${ip} 解析失败: ${data.message || '未知错误'}`)
    return null
  } catch (error) {
    console.error(`❌ IP ${ip} 解析异常:`, error.message)
    return null
  }
}

async function manualIPResolve() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 请设置环境变量: SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
    console.log('可用的环境变量:');
    Object.keys(process.env).filter(key => key.includes('SUPABASE')).forEach(key => {
      console.log(`  ${key}: ${process.env[key] ? '已设置' : '未设置'}`);
    });
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 开始手动解析IP地理位置...\n');
  
  try {
    // 1. 查找需要解析的IP
    console.log('1. 查找需要解析的IP...');
    const { data: ipsToResolve, error: queryError } = await supabase
      .from('visitor_stats')
      .select('ip_address, created_at')
      .is('country', null)
      .not('ip_address', 'is', null)
      .neq('ip_address', '127.0.0.1')
      .limit(10)
    
    if (queryError) {
      console.error('❌ 查询错误:', queryError.message);
      return;
    }
    
    const uniqueIPs = [...new Set(ipsToResolve.map(item => item.ip_address))];
    console.log(`找到 ${uniqueIPs.length} 个需要解析的IP:`, uniqueIPs);
    
    if (uniqueIPs.length === 0) {
      console.log('✅ 所有IP都已有地理位置数据');
      return;
    }
    
    // 2. 逐个解析并更新
    let successCount = 0;
    
    for (let i = 0; i < uniqueIPs.length; i++) {
      const ip = uniqueIPs[i];
      console.log(`\n正在处理 ${i + 1}/${uniqueIPs.length}: ${ip}`);
      
      try {
        const location = await getIPLocation(ip);
        
        if (location && location.country !== 'Unknown') {
          console.log(`✅ 解析成功: ${location.city}, ${location.country}`);
          
          // 更新数据库
          const { data: updateResult, error: updateError } = await supabase
            .from('visitor_stats')
            .update({
              country: location.country,
              city: location.city,
              region: location.region,
              timezone: location.timezone
            })
            .eq('ip_address', ip)
            .is('country', null)
            .select('id');
          
          if (updateError) {
            console.error(`❌ 更新失败 (${ip}):`, updateError.message);
          } else {
            console.log(`✅ 已更新 ${updateResult.length} 条记录`);
            successCount++;
          }
        } else {
          console.log(`⚠️ 无法解析IP: ${ip}`);
        }
        
        // 延迟避免API限流
        if (i < uniqueIPs.length - 1) {
          console.log('等待 1 秒...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ 处理IP ${ip} 时出错:`, error.message);
      }
    }
    
    console.log(`\n🎉 处理完成! 成功更新 ${successCount}/${uniqueIPs.length} 个IP的地理位置`);
    
    // 3. 验证结果
    console.log('\n3. 验证更新结果...');
    const { data: updatedData, error: verifyError } = await supabase
      .from('visitor_stats')
      .select('ip_address, country, city')
      .not('country', 'is', null)
      .limit(5);
      
    if (verifyError) {
      console.error('❌ 验证错误:', verifyError.message);
    } else {
      console.log('已更新的IP示例:');
      updatedData.forEach(record => {
        console.log(`  ${record.ip_address}: ${record.city}, ${record.country}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
  }
}

if (require.main === module) {
  manualIPResolve();
}