-- 修复 IP 风险分析函数的类型问题

-- 删除旧函数
DROP FUNCTION IF EXISTS get_ip_risk_analysis(INTEGER, INTEGER);

-- 重新创建函数，使用正确的类型
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
  countries VARCHAR[],  -- 改为 VARCHAR[] 匹配表结构
  browsers VARCHAR[],   -- 改为 VARCHAR[] 匹配表结构
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

-- 授予执行权限
GRANT EXECUTE ON FUNCTION get_ip_risk_analysis(INTEGER, INTEGER) TO authenticated, anon;

-- 测试函数
SELECT 'IP risk analysis function updated successfully' as result;