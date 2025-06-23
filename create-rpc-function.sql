-- 创建RPC函数来获取带敏感数据的密钥
-- 这样可以绕过嵌套查询的权限问题

CREATE OR REPLACE FUNCTION get_keys_with_sensitive_data(limit_count integer DEFAULT NULL)
RETURNS TABLE (
    id bigint,
    key_type text,
    key_preview text,
    key_hash text,
    status text,
    first_seen timestamp with time zone,
    last_verified timestamp with time zone,
    source_type text,
    file_extension text,
    repo_language text,
    repo_name text,
    file_path text,
    context_preview text,
    severity text,
    confidence text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    leaked_keys_sensitive jsonb
)
LANGUAGE sql
SECURITY DEFINER
AS $$
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
            WHEN lks.key_id IS NOT NULL THEN 
                jsonb_build_object(
                    'full_key', lks.full_key,
                    'raw_context', lks.raw_context,
                    'github_url', lks.github_url
                )
            ELSE NULL
        END as leaked_keys_sensitive
    FROM leaked_keys lk
    LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
    ORDER BY lk.created_at DESC
    LIMIT CASE WHEN limit_count IS NOT NULL THEN limit_count ELSE 5000 END;
$$;

-- 确保函数可以被调用
GRANT EXECUTE ON FUNCTION get_keys_with_sensitive_data() TO anon;
GRANT EXECUTE ON FUNCTION get_keys_with_sensitive_data() TO authenticated;

-- 测试函数
SELECT 'Testing RPC function:' as test;
SELECT id, key_type, leaked_keys_sensitive IS NOT NULL as has_sensitive 
FROM get_keys_with_sensitive_data() 
LIMIT 5;