-- 创建筛选统计函数，支持按条件筛选的统计
CREATE OR REPLACE FUNCTION get_filtered_stats(
  filter_key_type TEXT DEFAULT 'all',
  filter_severity TEXT DEFAULT 'all',
  filter_confidence TEXT DEFAULT 'all',
  filter_status TEXT DEFAULT 'all'
)
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
DECLARE
  where_conditions TEXT[] := ARRAY[]::TEXT[];
  where_clause TEXT := '';
BEGIN
  -- 构建WHERE条件
  IF filter_key_type != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('key_type = %L', filter_key_type));
  END IF;
  
  IF filter_severity != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('severity = %L', filter_severity));
  END IF;
  
  IF filter_confidence != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('confidence = %L', filter_confidence));
  END IF;
  
  IF filter_status != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('status = %L', filter_status));
  END IF;
  
  -- 构建WHERE子句
  IF array_length(where_conditions, 1) > 0 THEN
    where_clause := ' WHERE ' || array_to_string(where_conditions, ' AND ');
  END IF;
  
  RETURN QUERY
  EXECUTE format('
    SELECT 
      (SELECT COUNT(*) FROM leaked_keys %s)::BIGINT as total_keys,
      (SELECT COUNT(*) FROM leaked_keys %s AND created_at >= CURRENT_DATE)::BIGINT as today_keys,
      (SELECT COUNT(*) FROM leaked_keys %s AND severity = ''high'')::BIGINT as high_severity_keys,
      (SELECT COUNT(*) FROM leaked_keys %s AND status = ''valid'')::BIGINT as verified_keys,
      (SELECT jsonb_object_agg(key_type, count) FROM (
        SELECT key_type, COUNT(*) as count 
        FROM leaked_keys %s
        GROUP BY key_type 
        ORDER BY count DESC
      ) t)::JSONB as key_type_distribution,
      (SELECT jsonb_object_agg(severity, count) FROM (
        SELECT severity, COUNT(*) as count 
        FROM leaked_keys %s
        GROUP BY severity
        ORDER BY count DESC
      ) t)::JSONB as severity_distribution,
      (SELECT jsonb_object_agg(status, count) FROM (
        SELECT status, COUNT(*) as count 
        FROM leaked_keys %s
        GROUP BY status
        ORDER BY count DESC
      ) t)::JSONB as status_distribution',
    where_clause, where_clause, where_clause, where_clause, 
    where_clause, where_clause, where_clause
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_filtered_stats TO authenticated;

SELECT 'Created filtered stats function' as status;