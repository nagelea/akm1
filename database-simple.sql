-- 简化版数据库 - 管理员直接可见完整密钥
-- 在Supabase SQL编辑器中执行

-- 清理现有结构
DROP VIEW IF EXISTS recent_keys CASCADE;
DROP VIEW IF EXISTS stats_summary CASCADE;
DROP TABLE IF EXISTS access_logs CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS leaked_keys_sensitive CASCADE;
DROP TABLE IF EXISTS leaked_keys CASCADE;
DROP TABLE IF EXISTS daily_stats CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- 密钥记录表 - 公共信息
CREATE TABLE leaked_keys (
  id SERIAL PRIMARY KEY,
  key_type VARCHAR(50) NOT NULL,
  key_preview VARCHAR(100) NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'unknown',
  first_seen TIMESTAMP DEFAULT NOW(),
  last_verified TIMESTAMP,
  source_type VARCHAR(20) DEFAULT 'github',
  file_extension VARCHAR(10) DEFAULT 'unknown',
  repo_language VARCHAR(20) DEFAULT 'unknown',
  repo_name VARCHAR(200),
  file_path VARCHAR(500),
  context_preview TEXT,
  severity VARCHAR(10) DEFAULT 'medium',
  confidence VARCHAR(10) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 敏感数据表 - 存储完整密钥（无加密）
CREATE TABLE leaked_keys_sensitive (
  id SERIAL PRIMARY KEY,
  key_id INTEGER REFERENCES leaked_keys(id) ON DELETE CASCADE,
  full_key TEXT NOT NULL,                      -- 完整的原始密钥
  raw_context TEXT,                            -- 未脱敏的原始上下文
  github_url TEXT,                             -- 直接访问链接
  created_at TIMESTAMP DEFAULT NOW()
);

-- 管理员用户表
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 访问日志表
CREATE TABLE access_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES admin_users(id),
  action VARCHAR(50) NOT NULL,
  key_id INTEGER REFERENCES leaked_keys(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 每日统计表
CREATE TABLE daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  total_found INTEGER DEFAULT 0,
  by_type JSONB DEFAULT '{}',
  by_status JSONB DEFAULT '{}',
  by_severity JSONB DEFAULT '{}',
  by_language JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_leaked_keys_type ON leaked_keys(key_type);
CREATE INDEX idx_leaked_keys_severity ON leaked_keys(severity);
CREATE INDEX idx_leaked_keys_date ON leaked_keys(first_seen);
CREATE INDEX idx_leaked_keys_status ON leaked_keys(status);
CREATE INDEX idx_leaked_keys_hash ON leaked_keys(key_hash);
CREATE INDEX idx_leaked_keys_confidence ON leaked_keys(confidence);
CREATE INDEX idx_daily_stats_date ON daily_stats(date);

-- 创建触发器
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

-- 启用RLS
ALTER TABLE leaked_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaked_keys_sensitive ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- RLS策略
CREATE POLICY "Allow anonymous read access" ON leaked_keys FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read access" ON daily_stats FOR SELECT USING (true);

CREATE POLICY "Admin only access to sensitive data" ON leaked_keys_sensitive
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email' 
            AND role IN ('admin', 'viewer')
        )
    );

CREATE POLICY "Admin user management" ON admin_users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email' 
            AND role = 'admin'
        )
    );

CREATE POLICY "Admin access logs" ON access_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email' 
            AND role IN ('admin', 'viewer')
        )
    );

-- 服务角色全权限
CREATE POLICY "Allow service role full access" ON leaked_keys FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role full access" ON daily_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role full access" ON leaked_keys_sensitive FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role full access" ON admin_users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role full access" ON access_logs FOR ALL USING (auth.role() = 'service_role');

-- 创建视图
CREATE VIEW recent_keys AS
SELECT 
    id, key_type, key_preview, severity, first_seen, status,
    repo_name, file_path, file_extension, repo_language, context_preview, confidence
FROM leaked_keys 
WHERE first_seen >= NOW() - INTERVAL '7 days'
ORDER BY first_seen DESC;

CREATE VIEW stats_summary AS
SELECT 
    COUNT(*) as total_keys,
    COUNT(DISTINCT key_type) as unique_types,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
    COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
    COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity,
    COUNT(CASE WHEN first_seen >= CURRENT_DATE THEN 1 END) as today_count,
    COUNT(CASE WHEN first_seen >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_count
FROM leaked_keys;

-- 创建管理员账户
INSERT INTO admin_users (email, password_hash, role) VALUES 
('admin@test.com', 'temp123', 'admin');

-- 完成提示
SELECT 'Simplified database setup completed! No encryption needed.' as status;