// Test stats calculation limits
const { createClient } = require('@supabase/supabase-js');

// Load environment variables if available
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not available, using process.env directly');
}

async function testStatsLimits() {
  console.log('=== Testing Stats Calculation Limits ===\n');
  
  // Test different query methods
  const supabase = createClient(
    process.env.SUPABASE_URL || 'your-url',
    process.env.SUPABASE_SERVICE_KEY || 'your-key'
  );
  
  if (!process.env.SUPABASE_URL) {
    console.log('⚠️ No Supabase credentials found. This is a demo of query patterns.\n');
    showQueryPatterns();
    return;
  }
  
  try {
    console.log('1. Testing default query (may be limited to 1000)...');
    const { data: defaultData, error: defaultError } = await supabase
      .from('leaked_keys')
      .select('id, status, severity');
    
    if (defaultError) {
      console.error('Default query error:', defaultError);
    } else {
      console.log(`   Default query returned: ${defaultData.length} records`);
    }
    
    console.log('\n2. Testing query with explicit high limit...');
    const { data: limitedData, error: limitedError } = await supabase
      .from('leaked_keys')
      .select('id, status, severity')
      .limit(10000);
    
    if (limitedError) {
      console.error('Limited query error:', limitedError);
    } else {
      console.log(`   Limited query returned: ${limitedData.length} records`);
    }
    
    console.log('\n3. Testing count-only query (most accurate)...');
    const { count, error: countError } = await supabase
      .from('leaked_keys')
      .select('id', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Count query error:', countError);
    } else {
      console.log(`   Count query returned: ${count} total records`);
    }
    
    console.log('\n4. Testing status-specific counts...');
    const [unknownResult, validResult, invalidResult] = await Promise.all([
      supabase.from('leaked_keys').select('id', { count: 'exact', head: true }).eq('status', 'unknown'),
      supabase.from('leaked_keys').select('id', { count: 'exact', head: true }).eq('status', 'valid'),
      supabase.from('leaked_keys').select('id', { count: 'exact', head: true }).eq('status', 'invalid')
    ]);
    
    console.log(`   Unknown status: ${unknownResult.count || 0}`);
    console.log(`   Valid status: ${validResult.count || 0}`);
    console.log(`   Invalid status: ${invalidResult.count || 0}`);
    console.log(`   Total from status counts: ${(unknownResult.count || 0) + (validResult.count || 0) + (invalidResult.count || 0)}`);
    
    console.log('\n=== Summary ===');
    if (defaultData && limitedData && count !== null) {
      if (defaultData.length < limitedData.length || defaultData.length < count) {
        console.log('❌ DEFAULT QUERY IS LIMITED! This explains the 1000 record issue.');
        console.log(`   Default query: ${defaultData.length} records`);
        console.log(`   Limited query: ${limitedData.length} records`);
        console.log(`   Actual count: ${count} records`);
        console.log('\n💡 Solution: Use .limit(50000) or count-based queries for accurate stats.');
      } else {
        console.log('✅ Default query seems to return all records.');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

function showQueryPatterns() {
  console.log('=== Query Pattern Examples ===\n');
  
  console.log('❌ PROBLEMATIC (may be limited to 1000):');
  console.log('```javascript');
  console.log('const { data } = await supabase');
  console.log('  .from("leaked_keys")');
  console.log('  .select("id, status, severity")');
  console.log('  // No explicit limit - Supabase defaults to ~1000');
  console.log('```\n');
  
  console.log('✅ FIXED (explicit high limit):');
  console.log('```javascript');
  console.log('const { data } = await supabase');
  console.log('  .from("leaked_keys")');
  console.log('  .select("id, status, severity")');
  console.log('  .limit(50000) // Explicit limit');
  console.log('```\n');
  
  console.log('✅ BEST (count-based for stats):');
  console.log('```javascript');
  console.log('const { count } = await supabase');
  console.log('  .from("leaked_keys")');
  console.log('  .select("id", { count: "exact", head: true })');
  console.log('  .eq("status", "unknown")');
  console.log('```\n');
  
  console.log('=== Admin Dashboard Fixes ===\n');
  console.log('1. AdminDashboard.js: Use count-based queries ✅');
  console.log('2. SensitiveKeysList.js: Add explicit limits ✅');
  console.log('3. stats-trends API: Add explicit limits ✅');
  console.log('4. KeyStatistics.js: Depends on passed data ✅');
}

// Run test
testStatsLimits();