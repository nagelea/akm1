-- 创建分析统计的RPC函数

-- 获取分析概览的函数
CREATE OR REPLACE FUNCTION get_analytics_summary(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  total_visits BIGINT,
  unique_visitors BIGINT,
  page_views BIGINT,
  avg_session_duration NUMERIC,
  bounce_rate NUMERIC,
  top_pages JSONB,
  top_referrers JSONB,
  browser_stats JSONB,
  device_stats JSONB,
  country_stats JSONB
) AS $$
DECLARE
  start_date TIMESTAMP;
BEGIN
  start_date := NOW() - (days_back || ' days')::INTERVAL;
  
  RETURN QUERY
  SELECT 
    -- 总访问量
    COUNT(*)::BIGINT as total_visits,
    
    -- 独立访客数
    COUNT(DISTINCT visitor_id)::BIGINT as unique_visitors,
    
    -- 页面浏览量
    COUNT(*)::BIGINT as page_views,
    
    -- 平均会话时长
    COALESCE(AVG(session_duration), 0)::NUMERIC as avg_session_duration,
    
    -- 跳出率 (单页面会话占比)
    CASE 
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE session_duration <= 10) * 100.0 / COUNT(*))::NUMERIC
      ELSE 0::NUMERIC
    END as bounce_rate,
    
    -- 热门页面
    (
      SELECT COALESCE(jsonb_object_agg(page_path, page_count), '{}'::jsonb)
      FROM (
        SELECT page_path, COUNT(*)::INTEGER as page_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY page_path
        ORDER BY page_count DESC
        LIMIT 10
      ) top_pages_sub
    ) as top_pages,
    
    -- 主要来源
    (
      SELECT COALESCE(jsonb_object_agg(referrer, ref_count), '{}'::jsonb)
      FROM (
        SELECT 
          CASE 
            WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
            ELSE referrer
          END as referrer,
          COUNT(*)::INTEGER as ref_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY referrer
        ORDER BY ref_count DESC
        LIMIT 10
      ) top_ref_sub
    ) as top_referrers,
    
    -- 浏览器统计
    (
      SELECT COALESCE(jsonb_object_agg(browser, browser_count), '{}'::jsonb)
      FROM (
        SELECT browser, COUNT(*)::INTEGER as browser_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY browser
        ORDER BY browser_count DESC
        LIMIT 10
      ) browser_sub
    ) as browser_stats,
    
    -- 设备统计
    (
      SELECT COALESCE(jsonb_object_agg(device_type, device_count), '{}'::jsonb)
      FROM (
        SELECT device_type, COUNT(*)::INTEGER as device_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY device_type
        ORDER BY device_count DESC
      ) device_sub
    ) as device_stats,
    
    -- 国家统计 (如果有地理位置数据)
    (
      SELECT COALESCE(jsonb_object_agg(
        CASE WHEN country IS NULL THEN 'Unknown' ELSE country END, 
        country_count
      ), '{}'::jsonb)
      FROM (
        SELECT 
          country, 
          COUNT(*)::INTEGER as country_count
        FROM visitor_stats 
        WHERE created_at >= start_date
        GROUP BY country
        ORDER BY country_count DESC
        LIMIT 10
      ) country_sub
    ) as country_stats
    
  FROM visitor_stats 
  WHERE created_at >= start_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 每日统计更新函数
CREATE OR REPLACE FUNCTION update_daily_stats(target_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
BEGIN
  start_time := target_date::TIMESTAMP;
  end_time := (target_date + INTERVAL '1 day')::TIMESTAMP;
  
  INSERT INTO daily_stats (
    date,
    total_visits,
    unique_visitors,
    page_views,
    bounce_rate,
    avg_session_duration,
    top_pages,
    top_referrers,
    browser_stats,
    os_stats,
    device_stats,
    country_stats
  )
  SELECT 
    target_date,
    COUNT(*)::INTEGER,
    COUNT(DISTINCT visitor_id)::INTEGER,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE session_duration <= 10) * 100.0 / COUNT(*))::DECIMAL(5,2)
      ELSE 0::DECIMAL(5,2)
    END,
    COALESCE(AVG(session_duration), 0)::INTEGER,
    
    -- 热门页面
    (
      SELECT COALESCE(jsonb_object_agg(page_path, page_count), '{}'::jsonb)
      FROM (
        SELECT page_path, COUNT(*) as page_count
        FROM visitor_stats 
        WHERE created_at >= start_time AND created_at < end_time
        GROUP BY page_path
        ORDER BY page_count DESC
        LIMIT 10
      ) tp
    ),
    
    -- 主要来源
    (
      SELECT COALESCE(jsonb_object_agg(
        CASE WHEN referrer IS NULL OR referrer = '' THEN 'Direct' ELSE referrer END,
        ref_count
      ), '{}'::jsonb)
      FROM (
        SELECT referrer, COUNT(*) as ref_count
        FROM visitor_stats 
        WHERE created_at >= start_time AND created_at < end_time
        GROUP BY referrer
        ORDER BY ref_count DESC
        LIMIT 10
      ) tr
    ),
    
    -- 浏览器统计
    (
      SELECT COALESCE(jsonb_object_agg(browser, browser_count), '{}'::jsonb)
      FROM (
        SELECT browser, COUNT(*) as browser_count
        FROM visitor_stats 
        WHERE created_at >= start_time AND created_at < end_time
        GROUP BY browser
        ORDER BY browser_count DESC
      ) tb
    ),
    
    -- 操作系统统计
    (
      SELECT COALESCE(jsonb_object_agg(os, os_count), '{}'::jsonb)
      FROM (
        SELECT os, COUNT(*) as os_count
        FROM visitor_stats 
        WHERE created_at >= start_time AND created_at < end_time
        GROUP BY os
        ORDER BY os_count DESC
      ) tos
    ),
    
    -- 设备统计
    (
      SELECT COALESCE(jsonb_object_agg(device_type, device_count), '{}'::jsonb)
      FROM (
        SELECT device_type, COUNT(*) as device_count
        FROM visitor_stats 
        WHERE created_at >= start_time AND created_at < end_time
        GROUP BY device_type
        ORDER BY device_count DESC
      ) td
    ),
    
    -- 国家统计
    (
      SELECT COALESCE(jsonb_object_agg(
        CASE WHEN country IS NULL THEN 'Unknown' ELSE country END,
        country_count
      ), '{}'::jsonb)
      FROM (
        SELECT country, COUNT(*) as country_count
        FROM visitor_stats 
        WHERE created_at >= start_time AND created_at < end_time
        GROUP BY country
        ORDER BY country_count DESC
        LIMIT 10
      ) tc
    )
    
  FROM visitor_stats 
  WHERE created_at >= start_time AND created_at < end_time
  
  ON CONFLICT (date) 
  DO UPDATE SET
    total_visits = EXCLUDED.total_visits,
    unique_visitors = EXCLUDED.unique_visitors,
    page_views = EXCLUDED.page_views,
    bounce_rate = EXCLUDED.bounce_rate,
    avg_session_duration = EXCLUDED.avg_session_duration,
    top_pages = EXCLUDED.top_pages,
    top_referrers = EXCLUDED.top_referrers,
    browser_stats = EXCLUDED.browser_stats,
    os_stats = EXCLUDED.os_stats,
    device_stats = EXCLUDED.device_stats,
    country_stats = EXCLUDED.country_stats,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取实时在线用户数
CREATE OR REPLACE FUNCTION get_online_users_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM online_users 
    WHERE last_active > NOW() - INTERVAL '5 minutes'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 设置权限
GRANT EXECUTE ON FUNCTION get_analytics_summary(INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_daily_stats(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_online_users_count() TO authenticated, anon;