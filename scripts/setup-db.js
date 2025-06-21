const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setupDatabase() {
  console.log('🗄️  Setting up database schema...');

  try {
    // 创建密钥记录表
    const { error: tableError } = await supabase.rpc('create_leaked_keys_table', {});
    
    if (tableError && !tableError.message.includes('already exists')) {
      console.error('Failed to create leaked_keys table:', tableError);
    } else {
      console.log('✅ leaked_keys table ready');
    }

    // 创建统计表
    const { error: statsError } = await supabase.rpc('create_daily_stats_table', {});
    
    if (statsError && !statsError.message.includes('already exists')) {
      console.error('Failed to create daily_stats table:', statsError);
    } else {
      console.log('✅ daily_stats table ready');
    }

    // 创建索引
    await createIndexes();
    
    console.log('🎉 Database setup completed!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

async function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_leaked_keys_type ON leaked_keys(key_type)',
    'CREATE INDEX IF NOT EXISTS idx_leaked_keys_severity ON leaked_keys(severity)',
    'CREATE INDEX IF NOT EXISTS idx_leaked_keys_date ON leaked_keys(first_seen)',
    'CREATE INDEX IF NOT EXISTS idx_leaked_keys_status ON leaked_keys(status)',
    'CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date)',
  ];

  for (const sql of indexes) {
    try {
      await supabase.rpc('execute_sql', { query: sql });
      console.log(`✅ Index created: ${sql.split(' ')[5]}`);
    } catch (error) {
      console.log(`⚠️  Index might already exist: ${sql.split(' ')[5]}`);
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };