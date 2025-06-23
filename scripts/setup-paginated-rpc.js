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
    } else {
      console.log('⚠️ .env file not found, using system environment variables');
    }
  } catch (e) {
    console.log('⚠️ Could not load .env file:', e.message);
  }
}

// Load environment variables
loadEnvFile();

async function setupPaginatedRPC() {
  console.log('🗄️ Setting up paginated RPC functions...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    console.error('\n📝 Please create a .env file in the project root with:');
    console.error('   SUPABASE_URL=https://your-project.supabase.co');
    console.error('   SUPABASE_SERVICE_KEY=your_service_key_here');
    console.error('\n💡 Or execute the SQL directly via Supabase Dashboard > SQL Editor');
    console.error('   File: create-paginated-rpc.sql');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '..', 'create-paginated-rpc.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log('📄 Read SQL file successfully');
    
    // Execute the full SQL content as one statement
    // Supabase can handle multiple statements in one call
    const { data, error } = await supabase.rpc('execute_sql', { 
      query: sqlContent 
    });
    
    if (error) {
      console.error('❌ SQL execution error:', error);
      process.exit(1);
    }
    
    console.log('✅ Paginated RPC functions created successfully!');
    
    // Test the functions
    console.log('\n🧪 Testing the new functions...');
    
    // Test paginated function
    const { data: testData, error: testError } = await supabase.rpc('get_keys_paginated', {
      page_size: 5,
      page_offset: 0
    });
    
    if (testError) {
      console.error('⚠️ Test failed:', testError);
    } else {
      console.log(`✅ get_keys_paginated test: returned ${testData?.length || 0} records`);
      if (testData && testData.length > 0) {
        console.log(`   Total count available: ${testData[0].total_count}`);
      }
    }
    
    // Test statistics function
    const { data: statsData, error: statsError } = await supabase.rpc('get_keys_statistics');
    
    if (statsError) {
      console.error('⚠️ Statistics test failed:', statsError);
    } else {
      console.log(`✅ get_keys_statistics test: returned stats for ${statsData?.[0]?.total_count || 0} total keys`);
    }
    
    // Test total count function
    const { data: countData, error: countError } = await supabase.rpc('get_total_keys_count');
    
    if (countError) {
      console.error('⚠️ Total count test failed:', countError);
    } else {
      console.log(`✅ get_total_keys_count test: ${countData || 0} total keys`);
    }
    
    console.log('\n🎉 Paginated RPC setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update SensitiveKeysList.js to use get_keys_paginated()');
    console.log('   2. Update AdminDashboard.js to use get_keys_statistics()');
    console.log('   3. Replace existing RPC calls with new paginated versions');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupPaginatedRPC();