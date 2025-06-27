-- 创建IP分析相关的数据库函数
-- 在 Supabase SQL 编辑器中执行

-- 1. IP统计概览函数
CREATE OR REPLACE FUNCTION get_ip_analytics_summary(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  total_visits BIGINT,
  unique_ips BIGINT,
  unique_visitors BIGINT,
  avg_visits_per_ip NUMERIC,
  top_countries JSONB,
  top_isps JSONB,
  risk_distribution JSONB,
  hourly_distribution JSONB
) AS $$
DECLARE
  start_date TIMESTAMP;
BEGIN
  start_date := NOW() - (days_back || ' days')::INTERVAL;
  
  RETURN QUERY
  SELECT 
    -- 总访问量
    COUNT(*)::BIGINT as total_visits,
    
    -- 独立IP数量
    COUNT(DISTINCT ip_address)::BIGINT as unique_ips,
    
    -- 独立访客数量(基于visitor_id)
    COUNT(DISTINCT visitor_id)::BIGINT as unique_visitors,
    
    -- 平均每IP访问次数
    CASE 
      WHEN COUNT(DISTINCT ip_address) > 0 THEN
        (COUNT(*)::NUMERIC / COUNT(DISTINCT ip_address))
      ELSE 0::NUMERIC
    END as avg_visits_per_ip,
    
    -- 热门国家
    (
      SELECT COALESCE(jsonb_object_agg(
        CASE WHEN country IS NULL OR country = '' THEN 'Unknown' ELSE country END,
        country_count
      ), '{}'::jsonb)
      FROM (
        SELECT country, COUNT(DISTINCT ip_address)::INTEGER as country_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY country
        ORDER BY country_count DESC
        LIMIT 10
      ) countries_sub
    ) as top_countries,
    
    -- ISP统计(模拟，实际需要ISP数据)
    (
      SELECT jsonb_build_object(
        'Unknown', COUNT(DISTINCT ip_address)::INTEGER,
        'Analyzed', 0::INTEGER
      )
      FROM visitor_stats 
      WHERE created_at >= start_date
    ) as top_isps,
    
    -- 风险分布(基于访问频率)
    (
      SELECT jsonb_build_object(
        'low', low_risk,
        'medium', medium_risk,
        'high', high_risk
      )
      FROM (
        SELECT 
          COUNT(*) FILTER (WHERE visit_count <= 10)::INTEGER as low_risk,
          COUNT(*) FILTER (WHERE visit_count > 10 AND visit_count <= 50)::INTEGER as medium_risk,
          COUNT(*) FILTER (WHERE visit_count > 50)::INTEGER as high_risk
        FROM (
          SELECT ip_address, COUNT(*) as visit_count
          FROM visitor_stats 
          WHERE created_at >= start_date
          GROUP BY ip_address
        ) ip_counts
      ) risk_calc
    ) as risk_distribution,
    
    -- 24小时分布
    (
      SELECT jsonb_object_agg(
        hour_of_day::TEXT,
        hour_count
      )
      FROM (
        SELECT 
          EXTRACT(hour FROM created_at)::INTEGER as hour_of_day,
          COUNT(DISTINCT ip_address)::INTEGER as hour_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY EXTRACT(hour FROM created_at)
        ORDER BY hour_of_day
      ) hourly_sub
    ) as hourly_distribution
    
  FROM visitor_stats 
  WHERE created_at >= start_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. IP风险分析函数
CREATE OR REPLACE FUNCTION get_ip_risk_analysis(days_back INTEGER DEFAULT 7, ip_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  ip_address INET,
  visit_count BIGINT,
  unique_pages BIGINT,
  unique_days BIGINT,
  avg_session_duration NUMERIC,
  hour_span INTEGER,
  first_visit TIMESTAMP,
  last_visit TIMESTAMP,
  countries TEXT[],
  browsers TEXT[],
  user_agents TEXT[]
) AS $$
DECLARE
  start_date TIMESTAMP;
BEGIN
  start_date := NOW() - (days_back || ' days')::INTERVAL;
  
  RETURN QUERY
  SELECT 
    vs.ip_address,
    COUNT(*)::BIGINT as visit_count,
    COUNT(DISTINCT vs.page_path)::BIGINT as unique_pages,
    COUNT(DISTINCT DATE(vs.created_at))::BIGINT as unique_days,
    AVG(COALESCE(vs.session_duration, 0))::NUMERIC as avg_session_duration,
    (
      EXTRACT(hour FROM MAX(vs.created_at)) - 
      EXTRACT(hour FROM MIN(vs.created_at))
    )::INTEGER as hour_span,
    MIN(vs.created_at) as first_visit,
    MAX(vs.created_at) as last_visit,
    array_agg(DISTINCT vs.country) FILTER (WHERE vs.country IS NOT NULL) as countries,
    array_agg(DISTINCT vs.browser) FILTER (WHERE vs.browser IS NOT NULL) as browsers,
    array_agg(DISTINCT substring(vs.user_agent, 1, 100)) FILTER (WHERE vs.user_agent IS NOT NULL) as user_agents
  FROM visitor_stats vs
  WHERE vs.created_at >= start_date
    AND vs.ip_address IS NOT NULL
  GROUP BY vs.ip_address
  ORDER BY visit_count DESC, unique_pages DESC
  LIMIT ip_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. IP地理位置更新函数
CREATE OR REPLACE FUNCTION update_ip_locations()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  ip_record RECORD;
BEGIN
  -- 查找需要更新地理位置的IP
  FOR ip_record IN 
    SELECT DISTINCT ip_address
    FROM visitor_stats 
    WHERE (country IS NULL OR country = '')
      AND ip_address IS NOT NULL
      AND ip_address != '127.0.0.1'::INET
    LIMIT 100  -- 限制每次处理数量
  LOOP
    -- 这里需要外部服务调用，暂时标记为待处理
    UPDATE visitor_stats 
    SET country = 'Pending', city = 'Pending'
    WHERE ip_address = ip_record.ip_address 
      AND (country IS NULL OR country = '');
    
    updated_count := updated_count + 1;
  END LOOP;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. IP黑名单管理表
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id SERIAL PRIMARY KEY,
  ip_address INET NOT NULL UNIQUE,
  reason VARCHAR(255) NOT NULL,
  risk_level VARCHAR(20) DEFAULT 'medium',
  blocked_at TIMESTAMP DEFAULT NOW(),
  blocked_by VARCHAR(255),
  auto_detected BOOLEAN DEFAULT false,
  notes TEXT,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- 5. IP白名单管理表  
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id SERIAL PRIMARY KEY,
  ip_address INET NOT NULL UNIQUE,
  description VARCHAR(255),
  added_at TIMESTAMP DEFAULT NOW(),
  added_by VARCHAR(255),
  is_active BOOLEAN DEFAULT true
);

-- 6. IP访问限制检查函数
CREATE OR REPLACE FUNCTION check_ip_access(check_ip INET)
RETURNS TABLE (
  allowed BOOLEAN,
  reason VARCHAR(255),
  risk_level VARCHAR(20)
) AS $$
BEGIN
  -- 检查白名单
  IF EXISTS (SELECT 1 FROM ip_whitelist WHERE ip_address = check_ip AND is_active = true) THEN
    RETURN QUERY SELECT true, 'Whitelisted IP'::VARCHAR(255), 'safe'::VARCHAR(20);
    RETURN;
  END IF;
  
  -- 检查黑名单
  IF EXISTS (
    SELECT 1 FROM ip_blacklist 
    WHERE ip_address = check_ip 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN QUERY 
    SELECT 
      false, 
      bl.reason, 
      bl.risk_level
    FROM ip_blacklist bl 
    WHERE bl.ip_address = check_ip AND bl.is_active = true;
    RETURN;
  END IF;
  
  -- 默认允许
  RETURN QUERY SELECT true, 'No restrictions'::VARCHAR(255), 'unknown'::VARCHAR(20);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 自动风险检测函数
CREATE OR REPLACE FUNCTION auto_detect_risky_ips()
RETURNS INTEGER AS $$
DECLARE
  detected_count INTEGER := 0;
  ip_record RECORD;
BEGIN
  -- 检测高频访问IP (1小时内超过100次)
  FOR ip_record IN 
    SELECT 
      ip_address,
      COUNT(*) as visit_count
    FROM visitor_stats 
    WHERE created_at >= NOW() - INTERVAL '1 hour'
      AND ip_address IS NOT NULL
    GROUP BY ip_address
    HAVING COUNT(*) > 100
  LOOP
    INSERT INTO ip_blacklist (ip_address, reason, risk_level, auto_detected, expires_at)
    VALUES (
      ip_record.ip_address,
      'High frequency access: ' || ip_record.visit_count || ' visits in 1 hour',
      'high',
      true,
      NOW() + INTERVAL '24 hours'
    )
    ON CONFLICT (ip_address) DO NOTHING;
    
    detected_count := detected_count + 1;
  END LOOP;
  
  RETURN detected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_visitor_stats_ip_created ON visitor_stats(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_stats_country ON visitor_stats(country);
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_active ON ip_blacklist(ip_address, is_active);
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_active ON ip_whitelist(ip_address, is_active);

-- 启用RLS
ALTER TABLE ip_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;

-- RLS策略
CREATE POLICY "Admin access to IP blacklist" ON ip_blacklist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE email = auth.jwt() ->> 'email' 
      AND role IN ('admin', 'viewer')
    )
  );

CREATE POLICY "Admin access to IP whitelist" ON ip_whitelist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE email = auth.jwt() ->> 'email' 
      AND role IN ('admin', 'viewer')
    )
  );

-- 服务角色权限
CREATE POLICY "Service role IP management" ON ip_blacklist FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role IP management" ON ip_whitelist FOR ALL USING (auth.role() = 'service_role');

-- 授予函数执行权限
GRANT EXECUTE ON FUNCTION get_ip_analytics_summary(INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_ip_risk_analysis(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION check_ip_access(INET) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auto_detect_risky_ips() TO authenticated;
GRANT EXECUTE ON FUNCTION update_ip_locations() TO authenticated;

-- 创建定时任务(需要在Supabase中手动设置)
-- SELECT cron.schedule('auto-risk-detection', '*/30 * * * *', 'SELECT auto_detect_risky_ips();');
-- SELECT cron.schedule('ip-location-update', '0 3 * * *', 'SELECT update_ip_locations();');

COMMENT ON FUNCTION get_ip_analytics_summary(INTEGER) IS 'IP分析统计概览';
COMMENT ON FUNCTION get_ip_risk_analysis(INTEGER, INTEGER) IS 'IP风险分析详情';
COMMENT ON FUNCTION check_ip_access(INET) IS '检查IP访问权限';
COMMENT ON FUNCTION auto_detect_risky_ips() IS '自动检测风险IP';
COMMENT ON TABLE ip_blacklist IS 'IP黑名单管理';
COMMENT ON TABLE ip_whitelist IS 'IP白名单管理';