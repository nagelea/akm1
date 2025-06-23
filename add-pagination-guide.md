# 添加分页功能指南

由于Supabase的限制，需要手动在数据库中添加分页函数。

## 步骤1：登录Supabase控制台

1. 打开 https://supabase.com/dashboard
2. 进入你的项目：https://supabase.com/dashboard/project/uggzdzixrykmexoutqbj
3. 进入 **SQL Editor**

## 步骤2：执行分页函数SQL

将以下SQL代码复制粘贴到SQL Editor中执行：

```sql
-- 1. 基础分页查询函数
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
  id UUID,
  key_type TEXT,
  key_preview TEXT,
  severity TEXT,
  confidence TEXT,
  status TEXT,
  repo_name TEXT,
  file_path TEXT,
  repo_language TEXT,
  first_seen TIMESTAMPTZ,
  last_verified TIMESTAMPTZ,
  context_preview TEXT,
  full_key TEXT,
  raw_context TEXT,
  github_url TEXT
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

-- 2. 快速统计函数（用于仪表板）
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

-- 3. 主页最新密钥函数
CREATE OR REPLACE FUNCTION get_recent_keys(limit_count INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  key_type TEXT,
  key_preview TEXT,
  severity TEXT,
  repo_name TEXT,
  file_path TEXT,
  first_seen TIMESTAMPTZ,
  context_preview TEXT
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
```

## 步骤3：测试函数

执行以下测试查询确认函数工作正常：

```sql
-- 测试分页功能
SELECT * FROM get_keys_paginated(0, 5);

-- 测试统计功能  
SELECT * FROM get_dashboard_stats();

-- 测试最新密钥
SELECT * FROM get_recent_keys(10);
```

## 步骤4：继续前端优化

函数创建成功后，前端代码会自动使用新的分页功能。