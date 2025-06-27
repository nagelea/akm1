// 测试地理位置解析
async function testGeoResolve() {
  // 测试一个公网IP
  const testIP = '8.8.8.8';  
  
  try {
    console.log(`测试解析 IP: ${testIP}`);
    const response = await fetch(`http://ip-api.com/json/${testIP}?fields=status,country,countryCode,region,regionName,city,timezone,isp,org`);
    const data = await response.json();
    console.log('API返回:', JSON.stringify(data, null, 2));
    
    if (data.status === 'success') {
      console.log('✅ 地理位置API工作正常');
    } else {
      console.log('❌ 地理位置API返回失败状态');
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

testGeoResolve();