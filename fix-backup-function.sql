-- 修复备用函数 get_keys_with_sensitive_data，添加 limit_count 参数

DROP FUNCTION IF EXISTS get_keys_with_sensitive_data();
DROP FUNCTION IF EXISTS get_keys_with_sensitive_data(integer);

CREATE OR REPLACE FUNCTION get_keys_with_sensitive_data(
  limit_count INTEGER DEFAULT 5000
)
RETURNS TABLE (
  id INTEGER,
  key_type VARCHAR,
  key_preview VARCHAR,
  key_hash VARCHAR,
  status VARCHAR,
  first_seen TIMESTAMP,
  last_verified TIMESTAMP,
  source_type VARCHAR,
  file_extension VARCHAR,
  repo_language VARCHAR,
  repo_name VARCHAR,
  file_path VARCHAR,
  context_preview TEXT,
  severity VARCHAR,
  confidence VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  leaked_keys_sensitive JSONB
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
    lk.key_hash,
    lk.status,
    lk.first_seen,
    lk.last_verified,
    lk.source_type,
    lk.file_extension,
    lk.repo_language,
    lk.repo_name,
    lk.file_path,
    lk.context_preview,
    lk.severity,
    lk.confidence,
    lk.created_at,
    lk.updated_at,
    CASE 
      WHEN lks.full_key IS NOT NULL THEN 
        jsonb_build_object(
          'full_key', lks.full_key,
          'raw_context', lks.raw_context,
          'github_url', lks.github_url
        )
      ELSE NULL
    END as leaked_keys_sensitive
  FROM leaked_keys lk
  LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
  ORDER BY lk.first_seen DESC
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_keys_with_sensitive_data TO authenticated;

SELECT 'Fixed backup function with limit_count parameter' as status;