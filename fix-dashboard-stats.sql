-- 修复dashboard stats函数使用正确的时间字段
DROP FUNCTION IF EXISTS get_dashboard_stats();

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE (
  total_keys BIGINT,
  today_keys BIGINT,
  high_severity_keys BIGINT,
  verified_keys BIGINT,
  key_type_distribution JSONB,
  severity_distribution JSONB,
  status_distribution JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM leaked_keys)::BIGINT,
    (SELECT COUNT(*) FROM leaked_keys WHERE first_seen >= CURRENT_DATE)::BIGINT, -- 修复：使用first_seen
    (SELECT COUNT(*) FROM leaked_keys WHERE severity = 'high')::BIGINT,
    (SELECT COUNT(*) FROM leaked_keys WHERE status = 'valid')::BIGINT,
    (SELECT jsonb_object_agg(key_type, count) FROM (
      SELECT key_type, COUNT(*) as count 
      FROM leaked_keys 
      GROUP BY key_type 
      ORDER BY count DESC
    ) t)::JSONB,
    (SELECT jsonb_object_agg(severity, count) FROM (
      SELECT severity, COUNT(*) as count 
      FROM leaked_keys 
      GROUP BY severity
    ) t)::JSONB,
    (SELECT jsonb_object_agg(status, count) FROM (
      SELECT status, COUNT(*) as count 
      FROM leaked_keys 
      GROUP BY status
    ) t)::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;

-- 测试函数
SELECT 'Testing updated get_dashboard_stats...' as test_status;
SELECT total_keys, today_keys FROM get_dashboard_stats() LIMIT 1;