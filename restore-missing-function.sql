-- 恢复缺失的 get_keys_with_sensitive_data 函数
-- 这个函数被前端调用但在之前的修复中被意外删除了

DROP FUNCTION IF EXISTS get_keys_with_sensitive_data();

CREATE OR REPLACE FUNCTION get_keys_with_sensitive_data()
RETURNS TABLE (
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
  full_key TEXT,
  raw_context TEXT,
  github_url VARCHAR
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
  FROM leaked_keys lk
  LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
  ORDER BY lk.first_seen DESC;
END;
$$;

-- 授予权限
GRANT EXECUTE ON FUNCTION get_keys_with_sensitive_data TO authenticated;

SELECT 'Restored get_keys_with_sensitive_data function' as status;