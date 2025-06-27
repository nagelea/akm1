-- 创建简化版本的IP风险分析函数，避免数组类型问题

CREATE OR REPLACE FUNCTION get_ip_risk_analysis_simple(days_back INTEGER DEFAULT 7, ip_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  ip_address INET,
  visit_count BIGINT,
  unique_pages BIGINT,
  unique_days BIGINT,
  avg_session_duration NUMERIC,
  first_visit TIMESTAMP,
  last_visit TIMESTAMP,
  primary_country VARCHAR(50),
  primary_browser VARCHAR(50)
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
    MIN(vs.created_at) as first_visit,
    MAX(vs.created_at) as last_visit,
    -- 获取最常见的国家
    (
      SELECT country 
      FROM visitor_stats vs2 
      WHERE vs2.ip_address = vs.ip_address 
        AND vs2.country IS NOT NULL
        AND vs2.created_at >= start_date
      GROUP BY country 
      ORDER BY COUNT(*) DESC 
      LIMIT 1
    ) as primary_country,
    -- 获取最常见的浏览器
    (
      SELECT browser 
      FROM visitor_stats vs3 
      WHERE vs3.ip_address = vs.ip_address 
        AND vs3.browser IS NOT NULL
        AND vs3.created_at >= start_date
      GROUP BY browser 
      ORDER BY COUNT(*) DESC 
      LIMIT 1
    ) as primary_browser
  FROM visitor_stats vs
  WHERE vs.created_at >= start_date
    AND vs.ip_address IS NOT NULL
  GROUP BY vs.ip_address
  ORDER BY visit_count DESC, unique_pages DESC
  LIMIT ip_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION get_ip_risk_analysis_simple(INTEGER, INTEGER) TO authenticated, anon;

-- 测试函数
SELECT 'Simple IP risk analysis function created successfully' as result;