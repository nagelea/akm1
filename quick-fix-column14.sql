-- 快速修复第14列 full_key 字段类型错误
-- 只修改 full_key: VARCHAR -> TEXT

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
  key_type VARCHAR,
  key_preview VARCHAR,
  severity VARCHAR,
  confidence VARCHAR,
  status VARCHAR,
  repo_name VARCHAR,
  file_path VARCHAR,
  repo_language VARCHAR,
  first_seen TIMESTAMP,
  last_verified TIMESTAMP,
  context_preview TEXT,
  full_key TEXT,              -- ✅ 修复：第14列改为TEXT
  raw_context TEXT,
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

SELECT 'Fixed column 14 (full_key) type mismatch' as status;