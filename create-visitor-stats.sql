-- 访问统计表
CREATE TABLE IF NOT EXISTS visitor_stats (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100) NOT NULL,           -- 访客唯一标识(基于IP+UA哈希)
  ip_address INET,                            -- 访客IP地址
  user_agent TEXT,                            -- 用户代理字符串
  page_path VARCHAR(255) NOT NULL,            -- 访问页面路径
  referrer VARCHAR(500),                      -- 来源页面
  country VARCHAR(50),                        -- 国家
  city VARCHAR(100),                          -- 城市
  device_type VARCHAR(20),                    -- desktop, mobile, tablet
  browser VARCHAR(50),                        -- Chrome, Firefox, Safari等
  os VARCHAR(50),                             -- Windows, macOS, Linux等
  screen_resolution VARCHAR(20),              -- 屏幕分辨率
  session_duration INTEGER DEFAULT 0,        -- 会话持续时间(秒)
  created_at TIMESTAMP DEFAULT NOW()
);

-- 每日统计汇总表
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,                  -- 统计日期
  total_visits INTEGER DEFAULT 0,            -- 总访问量
  unique_visitors INTEGER DEFAULT 0,         -- 独立访客数
  page_views INTEGER DEFAULT 0,              -- 页面浏览量
  bounce_rate DECIMAL(5,2) DEFAULT 0,        -- 跳出率
  avg_session_duration INTEGER DEFAULT 0,    -- 平均会话时长
  top_pages JSONB,                           -- 热门页面统计
  top_referrers JSONB,                       -- 主要来源统计
  browser_stats JSONB,                       -- 浏览器统计
  os_stats JSONB,                            -- 操作系统统计
  device_stats JSONB,                        -- 设备类型统计
  country_stats JSONB,                       -- 国家分布统计
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 实时在线用户表
CREATE TABLE IF NOT EXISTS online_users (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100) NOT NULL UNIQUE,   -- 访客唯一标识
  page_path VARCHAR(255) NOT NULL,           -- 当前页面
  last_active TIMESTAMP DEFAULT NOW(),       -- 最后活跃时间
  session_start TIMESTAMP DEFAULT NOW()      -- 会话开始时间
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_visitor_stats_created_at ON visitor_stats(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_stats_visitor_id ON visitor_stats(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_stats_page_path ON visitor_stats(page_path);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_online_users_last_active ON online_users(last_active);

-- 自动清理过期数据的函数
CREATE OR REPLACE FUNCTION cleanup_old_visitor_data()
RETURNS void AS $$
BEGIN
  -- 删除30天前的访问记录
  DELETE FROM visitor_stats WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- 删除90天前的每日统计
  DELETE FROM daily_stats WHERE date < CURRENT_DATE - INTERVAL '90 days';
  
  -- 删除5分钟无活动的在线用户
  DELETE FROM online_users WHERE last_active < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- 创建定时任务清理数据(需要在Supabase中手动设置)
-- SELECT cron.schedule('cleanup-visitor-data', '0 2 * * *', 'SELECT cleanup_old_visitor_data();');

-- RLS策略设置
ALTER TABLE visitor_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_users ENABLE ROW LEVEL SECURITY;

-- 允许所有人插入访问统计(匿名访问)
CREATE POLICY "Allow insert for visitor stats" ON visitor_stats
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 只允许认证用户查看统计数据
CREATE POLICY "Allow select for authenticated users" ON visitor_stats
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow select for authenticated users" ON daily_stats
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow select for authenticated users" ON online_users
  FOR SELECT TO authenticated
  USING (true);

-- 允许匿名用户更新在线状态
CREATE POLICY "Allow upsert for online users" ON online_users
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);