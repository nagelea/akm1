-- 多数据源扫描系统数据库表
-- 用于跟踪扫描会话、数据源统计和性能监控

-- 扫描会话记录表
CREATE TABLE IF NOT EXISTS scan_sessions (
  id SERIAL PRIMARY KEY,
  scan_type VARCHAR(50) NOT NULL,              -- 'multi_source', 'single_source', 'manual'
  sources TEXT[] DEFAULT '{}',                 -- 参与的数据源列表
  total_found INTEGER DEFAULT 0,              -- 总共发现的密钥数量
  duration_ms BIGINT DEFAULT 0,               -- 扫描持续时间(毫秒)
  results_breakdown JSONB DEFAULT '{}',       -- 按数据源分解的结果
  errors JSONB DEFAULT '[]',                  -- 错误日志
  config JSONB DEFAULT '{}',                  -- 扫描配置参数
  status VARCHAR(20) DEFAULT 'completed',     -- 'running', 'completed', 'failed'
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP DEFAULT NOW()
);

-- 数据源性能统计表
CREATE TABLE IF NOT EXISTS data_source_stats (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(50) NOT NULL,           -- 'github', 'gitlab', 'gist', etc.
  scan_date DATE DEFAULT CURRENT_DATE,       -- 扫描日期
  
  -- 扫描指标
  requests_made INTEGER DEFAULT 0,           -- API请求数量
  results_found INTEGER DEFAULT 0,           -- 发现的结果数量
  keys_extracted INTEGER DEFAULT 0,          -- 提取的密钥数量
  duplicates_filtered INTEGER DEFAULT 0,     -- 过滤的重复项
  
  -- 性能指标
  avg_response_time_ms INTEGER DEFAULT 0,    -- 平均响应时间
  rate_limit_hits INTEGER DEFAULT 0,         -- 触发限制次数
  errors_count INTEGER DEFAULT 0,            -- 错误次数
  
  -- 内容指标
  files_scanned INTEGER DEFAULT 0,           -- 扫描的文件数量
  repositories_scanned INTEGER DEFAULT 0,    -- 扫描的仓库数量
  
  -- 质量指标
  false_positives INTEGER DEFAULT 0,         -- 误报数量
  confirmed_valid INTEGER DEFAULT 0,         -- 确认有效数量
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 数据源配置表
CREATE TABLE IF NOT EXISTS data_source_config (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(50) UNIQUE NOT NULL,
  
  -- 配置参数
  enabled BOOLEAN DEFAULT true,
  rate_limit_ms INTEGER DEFAULT 1000,        -- 请求间隔
  max_results_per_scan INTEGER DEFAULT 100,  -- 每次扫描最大结果数
  timeout_ms INTEGER DEFAULT 30000,          -- 超时时间
  
  -- API配置
  api_endpoint VARCHAR(255),
  requires_auth BOOLEAN DEFAULT false,
  auth_type VARCHAR(50),                     -- 'token', 'oauth', 'none'
  
  -- 搜索配置
  search_terms TEXT[] DEFAULT '{}',          -- 搜索关键词
  file_patterns TEXT[] DEFAULT '{}',         -- 文件模式
  exclude_patterns TEXT[] DEFAULT '{}',      -- 排除模式
  
  -- 高级配置
  custom_config JSONB DEFAULT '{}',         -- 自定义配置
  
  last_updated TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_scan_sessions_type_date ON scan_sessions(scan_type, completed_at);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_sources ON scan_sessions USING gin(sources);
CREATE INDEX IF NOT EXISTS idx_data_source_stats_source_date ON data_source_stats(source_name, scan_date);
CREATE INDEX IF NOT EXISTS idx_data_source_config_enabled ON data_source_config(enabled) WHERE enabled = true;

-- 自动更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为相关表添加自动更新触发器
DROP TRIGGER IF EXISTS update_data_source_stats_updated_at ON data_source_stats;
CREATE TRIGGER update_data_source_stats_updated_at 
    BEFORE UPDATE ON data_source_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 初始化默认数据源配置
INSERT INTO data_source_config (source_name, enabled, rate_limit_ms, search_terms, file_patterns) 
VALUES 
  ('github', true, 2000, ARRAY['sk-', 'sk-ant-', 'AIza'], ARRAY['*.py', '*.js', '*.json', '*.env']),
  ('gitlab', true, 1000, ARRAY['sk-', 'sk-ant-', 'AIza'], ARRAY['*.py', '*.js', '*.json', '*.env']),
  ('gist', true, 2000, ARRAY['sk-', 'sk-ant-', 'AIza'], ARRAY['*.py', '*.js', '*.json']),
  ('pastebin', false, 5000, ARRAY['sk-', 'api_key'], ARRAY['*.txt'])
ON CONFLICT (source_name) DO NOTHING;

-- 创建数据源统计汇总视图
CREATE OR REPLACE VIEW data_source_summary AS
SELECT 
  source_name,
  COUNT(*) as total_scans,
  SUM(keys_extracted) as total_keys_found,
  SUM(requests_made) as total_requests,
  ROUND(AVG(avg_response_time_ms)) as avg_response_time,
  SUM(errors_count) as total_errors,
  MAX(scan_date) as last_scan_date,
  ROUND(
    CASE 
      WHEN SUM(keys_extracted + false_positives) > 0 
      THEN (SUM(confirmed_valid)::DECIMAL / SUM(keys_extracted + false_positives)) * 100 
      ELSE 0 
    END, 2
  ) as accuracy_percentage
FROM data_source_stats 
WHERE scan_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY source_name
ORDER BY total_keys_found DESC;

-- 创建最近扫描会话视图
CREATE OR REPLACE VIEW recent_scan_sessions AS
SELECT 
  id,
  scan_type,
  array_to_string(sources, ', ') as sources_list,
  total_found,
  ROUND(duration_ms::DECIMAL / 1000, 1) as duration_seconds,
  status,
  completed_at,
  CASE 
    WHEN jsonb_array_length(errors) > 0 THEN '❌'
    WHEN total_found > 0 THEN '✅'
    ELSE '🔍'
  END as status_icon
FROM scan_sessions 
WHERE completed_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY completed_at DESC;

-- 设置 RLS 策略
ALTER TABLE scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source_config ENABLE ROW LEVEL SECURITY;

-- 允许认证用户查看扫描数据
CREATE POLICY "Allow authenticated read on scan_sessions" ON scan_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read on data_source_stats" ON data_source_stats
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read on data_source_config" ON data_source_config
  FOR SELECT TO authenticated USING (true);

-- 允许服务角色完全访问
CREATE POLICY "Allow service role full access on scan_sessions" ON scan_sessions
  FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service role full access on data_source_stats" ON data_source_stats
  FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service role full access on data_source_config" ON data_source_config
  FOR ALL TO service_role USING (true);

-- 验证设置
SELECT 'Multi-source scanning tables created successfully!' as result;

-- 显示已创建的表
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('scan_sessions', 'data_source_stats', 'data_source_config')
ORDER BY table_name;