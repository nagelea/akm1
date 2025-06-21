-- API密钥泄露监控系统数据库Schema
-- 在Supabase中手动执行此SQL文件

-- 密钥记录表
CREATE TABLE IF NOT EXISTS leaked_keys (
  id SERIAL PRIMARY KEY,
  key_type VARCHAR(50) NOT NULL,                -- openai, google, anthropic等
  key_preview VARCHAR(100) NOT NULL,            -- 前几位+掩码显示
  key_hash VARCHAR(64) UNIQUE NOT NULL,         -- 完整密钥的SHA256哈希用于去重
  status VARCHAR(20) DEFAULT 'unknown',         -- valid, invalid, revoked, unknown
  first_seen TIMESTAMP DEFAULT NOW(),           -- 首次发现时间
  last_verified TIMESTAMP,                      -- 最后验证时间
  source_type VARCHAR(20) DEFAULT 'github',     -- github, gitlab等
  file_extension VARCHAR(10) DEFAULT 'unknown', -- .js, .py, .env等
  repo_language VARCHAR(20) DEFAULT 'unknown',  -- JavaScript, Python等
  repo_name VARCHAR(200),                       -- 仓库全名 owner/repo
  file_path VARCHAR(500),                       -- 文件路径
  context_preview TEXT,                         -- 代码上下文片段
  severity VARCHAR(10) DEFAULT 'medium',        -- high, medium, low
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 每日统计表（预聚合数据）
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  total_found INTEGER DEFAULT 0,
  by_type JSONB DEFAULT '{}',        -- 按类型统计
  by_status JSONB DEFAULT '{}',      -- 按状态统计
  by_severity JSONB DEFAULT '{}',    -- 按严重程度统计
  by_language JSONB DEFAULT '{}',    -- 按语言统计
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_leaked_keys_type ON leaked_keys(key_type);
CREATE INDEX IF NOT EXISTS idx_leaked_keys_severity ON leaked_keys(severity);
CREATE INDEX IF NOT EXISTS idx_leaked_keys_date ON leaked_keys(first_seen);
CREATE INDEX IF NOT EXISTS idx_leaked_keys_status ON leaked_keys(status);
CREATE INDEX IF NOT EXISTS idx_leaked_keys_hash ON leaked_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);

-- 创建触发器自动更新updated_at字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leaked_keys_updated_at BEFORE UPDATE ON leaked_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_stats_updated_at BEFORE UPDATE ON daily_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建RLS (Row Level Security) 策略
ALTER TABLE leaked_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户只读访问
CREATE POLICY "Allow anonymous read access" ON leaked_keys
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read access" ON daily_stats
    FOR SELECT USING (true);

-- 只允许服务角色写入
CREATE POLICY "Allow service role full access" ON leaked_keys
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access" ON daily_stats
    FOR ALL USING (auth.role() = 'service_role');

-- 创建视图用于API查询
CREATE OR REPLACE VIEW recent_keys AS
SELECT 
    id,
    key_type,
    key_preview,
    severity,
    first_seen,
    status,
    repo_name,
    file_path,
    file_extension,
    repo_language,
    context_preview
FROM leaked_keys 
WHERE first_seen >= NOW() - INTERVAL '7 days'
ORDER BY first_seen DESC;

-- 创建统计视图
CREATE OR REPLACE VIEW stats_summary AS
SELECT 
    COUNT(*) as total_keys,
    COUNT(DISTINCT key_type) as unique_types,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
    COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
    COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity,
    COUNT(CASE WHEN first_seen >= CURRENT_DATE THEN 1 END) as today_count,
    COUNT(CASE WHEN first_seen >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_count
FROM leaked_keys;

-- 插入示例数据（可选，用于测试）
INSERT INTO daily_stats (date, total_found, by_type, by_severity) VALUES 
('2024-06-20', 15, '{"openai": 8, "google": 4, "anthropic": 3}', '{"high": 2, "medium": 8, "low": 5}')
ON CONFLICT (date) DO NOTHING;