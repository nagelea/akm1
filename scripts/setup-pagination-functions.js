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

async function setupPaginationFunctions() {
  console.log('🚀 Setting up database pagination functions...\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'supabase-pagination-functions.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📋 Executing pagination functions SQL...');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', {
      sql: sqlContent
    });
    
    if (error) {
      // Fallback: try direct execution (if exec_sql doesn't exist)
      console.log('⚠️ Direct SQL execution failed, trying alternative method...');
      
      // Split SQL into individual statements and execute them
      const statements = sqlContent
        .split(/;\s*\n/)
        .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'))
        .map(stmt => stmt.trim());
      
      for (const [index, statement] of statements.entries()) {
        if (statement) {
          console.log(`📝 Executing statement ${index + 1}/${statements.length}...`);
          try {
            const { error: stmtError } = await supabase.rpc('exec_sql', {
              sql: statement + ';'
            });
            if (stmtError) {
              console.error(`❌ Statement ${index + 1} failed:`, stmtError);
            } else {
              console.log(`✅ Statement ${index + 1} executed successfully`);
            }
          } catch (e) {
            console.error(`❌ Statement ${index + 1} error:`, e.message);
          }
        }
      }
    } else {
      console.log('✅ All pagination functions created successfully');
    }
    
    // Test the functions
    console.log('\n🧪 Testing pagination functions...');
    
    // Test get_keys_paginated
    const { data: paginatedData, error: paginatedError } = await supabase
      .rpc('get_keys_paginated', {
        page_offset: 0,
        page_size: 5
      });
    
    if (paginatedError) {
      console.error('❌ get_keys_paginated test failed:', paginatedError);
    } else {
      console.log(`✅ get_keys_paginated: Returns ${paginatedData?.length || 0} records`);
      if (paginatedData && paginatedData.length > 0) {
        console.log(`   Total count: ${paginatedData[0].total_count}`);
      }
    }
    
    // Test get_dashboard_stats
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_dashboard_stats');
    
    if (statsError) {
      console.error('❌ get_dashboard_stats test failed:', statsError);
    } else {
      console.log(`✅ get_dashboard_stats: Returns comprehensive statistics`);
      if (statsData && statsData.length > 0) {
        const stats = statsData[0];
        console.log(`   Total keys: ${stats.total_keys}`);
        console.log(`   Today keys: ${stats.today_keys}`);
        console.log(`   High severity: ${stats.high_severity_keys}`);
      }
    }
    
    // Test get_recent_keys
    const { data: recentData, error: recentError } = await supabase
      .rpc('get_recent_keys', { limit_count: 10 });
    
    if (recentError) {
      console.error('❌ get_recent_keys test failed:', recentError);
    } else {
      console.log(`✅ get_recent_keys: Returns ${recentData?.length || 0} recent records`);
    }
    
    console.log('\n🎉 Pagination functions setup completed!');
    console.log('\n📋 Available functions:');
    console.log('   • get_keys_paginated(offset, size, search, filters...)');
    console.log('   • get_dashboard_stats()');
    console.log('   • get_recent_keys(limit)');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupPaginationFunctions();