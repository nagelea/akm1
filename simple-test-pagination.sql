-- 简化的测试分页函数，使用更通用的TEXT类型

DROP FUNCTION IF EXISTS get_keys_paginated(integer,integer,text,text,text,text,text);

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
  key_type TEXT,              -- 改为TEXT避免VARCHAR长度问题
  key_preview TEXT,           -- 改为TEXT
  severity TEXT,              -- 改为TEXT
  confidence TEXT,            -- 改为TEXT
  status TEXT,                -- 改为TEXT
  repo_name TEXT,             -- 改为TEXT
  file_path TEXT,             -- 改为TEXT
  repo_language TEXT,         -- 改为TEXT
  first_seen TIMESTAMP,
  last_verified TIMESTAMP,
  context_preview TEXT,
  full_key TEXT,
  raw_context TEXT,
  github_url TEXT             -- 改为TEXT
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
  base_query := '
    FROM leaked_keys lk
    LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
  ';
  
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
  
  IF array_length(where_conditions, 1) > 0 THEN
    base_query := base_query || ' WHERE ' || array_to_string(where_conditions, ' AND ');
  END IF;
  
  final_query := 'SELECT COUNT(*) ' || base_query;
  EXECUTE final_query INTO total_records;
  
  RETURN QUERY
  EXECUTE format('
    SELECT 
      %L::BIGINT as total_count,
      lk.id,
      lk.key_type::TEXT,
      lk.key_preview::TEXT,
      lk.severity::TEXT,
      lk.confidence::TEXT,
      lk.status::TEXT,
      lk.repo_name::TEXT,
      lk.file_path::TEXT,
      lk.repo_language::TEXT,
      lk.first_seen,
      lk.last_verified,
      lk.context_preview,
      lks.full_key::TEXT,
      lks.raw_context,
      lks.github_url::TEXT
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

SELECT 'Created simplified pagination function with all TEXT types' as status;