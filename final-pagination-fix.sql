-- 最终修复：使用正确的TIMESTAMP类型（不是TIMESTAMPTZ）
-- 解决 "timestamp without time zone does not match expected type timestamp with time zone" 错误

-- 1. 删除现有的函数
DROP FUNCTION IF EXISTS get_keys_paginated(integer,integer,text,text,text,text,text);
DROP FUNCTION IF EXISTS get_dashboard_stats();
DROP FUNCTION IF EXISTS get_recent_keys(integer);

-- 2. 重新创建分页查询函数（使用正确的TIMESTAMP类型）
CREATE OR REPLACE FUNCTION get_keys_paginated(
  page_offset INTEGER DEFAULT 0,
  page_size INTEGER DEFAULT 20,
  search_query TEXT DEFAULT '',
  filter_key_type TEXT DEFAULT 'all',
  filter_severity TEXT DEFAULT 'all',
  filter_confidence TEXT DEFAULT 'all',
  filter_status TEXT DEFAULT 'all'
)
RETURNS TABLE (
  total_count BIGINT,
  id INTEGER,
  key_type VARCHAR,
  key_preview VARCHAR,
  severity VARCHAR,
  confidence VARCHAR,
  status VARCHAR,
  repo_name VARCHAR,
  file_path VARCHAR,
  repo_language VARCHAR,
  first_seen TIMESTAMP,      -- ✅ 修正：使用TIMESTAMP而不是TIMESTAMPTZ
  last_verified TIMESTAMP,   -- ✅ 修正：使用TIMESTAMP而不是TIMESTAMPTZ
  context_preview VARCHAR,
  full_key VARCHAR,
  raw_context VARCHAR,
  github_url VARCHAR
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_records BIGINT;
  base_query TEXT;
  where_conditions TEXT[] := ARRAY[]::TEXT[];
  final_query TEXT;
BEGIN
  -- 构建基础查询
  base_query := '
    FROM leaked_keys lk
    LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
  ';
  
  -- 添加搜索条件
  IF search_query != '' THEN
    where_conditions := array_append(where_conditions, 
      format('(
        lk.repo_name ILIKE %L OR 
        lk.file_path ILIKE %L OR 
        lk.key_preview ILIKE %L OR 
        lk.context_preview ILIKE %L OR 
        lks.raw_context ILIKE %L OR 
        lk.repo_language ILIKE %L OR 
        lk.key_type ILIKE %L
      )', 
      '%' || search_query || '%',
      '%' || search_query || '%',
      '%' || search_query || '%',
      '%' || search_query || '%',
      '%' || search_query || '%',
      '%' || search_query || '%',
      '%' || search_query || '%'
      )
    );
  END IF;
  
  -- 添加筛选条件
  IF filter_key_type != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('lk.key_type = %L', filter_key_type));
  END IF;
  
  IF filter_severity != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('lk.severity = %L', filter_severity));
  END IF;
  
  IF filter_confidence != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('lk.confidence = %L', filter_confidence));
  END IF;
  
  IF filter_status != 'all' THEN
    where_conditions := array_append(where_conditions, 
      format('lk.status = %L', filter_status));
  END IF;
  
  -- 构建WHERE子句
  IF array_length(where_conditions, 1) > 0 THEN
    base_query := base_query || ' WHERE ' || array_to_string(where_conditions, ' AND ');
  END IF;
  
  -- 获取总记录数
  final_query := 'SELECT COUNT(*) ' || base_query;
  EXECUTE final_query INTO total_records;
  
  -- 返回分页数据
  RETURN QUERY
  EXECUTE format('
    SELECT 
      %L::BIGINT as total_count,
      lk.id,
      lk.key_type,
      lk.key_preview,
      lk.severity,
      lk.confidence,
      lk.status,
      lk.repo_name,
      lk.file_path,
      lk.repo_language,
      lk.first_seen,
      lk.last_verified,
      lk.context_preview,
      lks.full_key,
      lks.raw_context,
      lks.github_url
    %s
    ORDER BY lk.first_seen DESC
    LIMIT %L OFFSET %L',
    total_records,
    base_query,
    page_size,
    page_offset
  );
END;
$$;

-- 3. 重新创建统计函数
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
    (SELECT COUNT(*) FROM leaked_keys WHERE created_at >= CURRENT_DATE)::BIGINT,
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

-- 4. 重新创建最新密钥函数（使用正确的TIMESTAMP类型）
CREATE OR REPLACE FUNCTION get_recent_keys(limit_count INTEGER DEFAULT 50)
RETURNS TABLE (
  id INTEGER,
  key_type VARCHAR,
  key_preview VARCHAR,
  severity VARCHAR,
  repo_name VARCHAR,
  file_path VARCHAR,
  first_seen TIMESTAMP,      -- ✅ 修正：使用TIMESTAMP而不是TIMESTAMPTZ
  context_preview VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lk.id,
    lk.key_type,
    lk.key_preview,
    lk.severity,
    lk.repo_name,
    lk.file_path,
    lk.first_seen,
    lk.context_preview
  FROM leaked_keys lk
  ORDER BY lk.first_seen DESC
  LIMIT limit_count;
END;
$$;

-- 5. 授予执行权限
GRANT EXECUTE ON FUNCTION get_keys_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_keys TO authenticated;

-- 6. 测试函数是否工作正常
SELECT 'Testing get_keys_paginated...' as test_status;
SELECT COUNT(*) as paginated_test FROM get_keys_paginated(0, 1);

SELECT 'Testing get_dashboard_stats...' as test_status;
SELECT total_keys FROM get_dashboard_stats() LIMIT 1;

SELECT 'Testing get_recent_keys...' as test_status;
SELECT COUNT(*) as recent_test FROM get_recent_keys(1);

SELECT '✅ All pagination functions fixed with correct TIMESTAMP types!' as final_status;