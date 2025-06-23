-- 创建支持真正分页的RPC函数
-- 解决1000行限制和重复获取全部数据的问题

CREATE OR REPLACE FUNCTION get_keys_paginated(
    page_size integer DEFAULT 20,
    page_offset integer DEFAULT 0,
    filter_type text DEFAULT NULL,
    filter_status text DEFAULT NULL,
    filter_severity text DEFAULT NULL,
    search_query text DEFAULT NULL
)
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
    leaked_keys_sensitive jsonb,
    total_count bigint -- 返回总数用于分页计算
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    WITH filtered_data AS (
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
        WHERE 
            -- 类型筛选
            (filter_type IS NULL OR lk.key_type = filter_type)
            -- 状态筛选
            AND (filter_status IS NULL OR lk.status = filter_status)
            -- 严重程度筛选
            AND (filter_severity IS NULL OR lk.severity = filter_severity)
            -- 搜索功能
            AND (
                search_query IS NULL 
                OR search_query = ''
                OR lk.repo_name ILIKE '%' || search_query || '%'
                OR lk.file_path ILIKE '%' || search_query || '%'
                OR lk.key_preview ILIKE '%' || search_query || '%'
                OR lk.context_preview ILIKE '%' || search_query || '%'
                OR lk.repo_language ILIKE '%' || search_query || '%'
                OR lk.key_type ILIKE '%' || search_query || '%'
                OR lks.raw_context ILIKE '%' || search_query || '%'
            )
    ),
    total_rows AS (
        SELECT COUNT(*) as total_count FROM filtered_data
    )
    SELECT 
        fd.*,
        tr.total_count
    FROM filtered_data fd
    CROSS JOIN total_rows tr
    ORDER BY fd.created_at DESC
    LIMIT page_size
    OFFSET page_offset;
$$;

-- 创建更高效的统计查询函数
CREATE OR REPLACE FUNCTION get_keys_statistics(
    filter_type text DEFAULT NULL,
    filter_status text DEFAULT NULL,
    filter_severity text DEFAULT NULL,
    search_query text DEFAULT NULL
)
RETURNS TABLE (
    total_count bigint,
    today_count bigint,
    high_severity_count bigint,
    verified_count bigint,
    unknown_count bigint,
    valid_count bigint,
    invalid_count bigint,
    by_type jsonb,
    by_severity jsonb,
    by_confidence jsonb
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    WITH filtered_data AS (
        SELECT 
            lk.key_type,
            lk.status,
            lk.severity,
            lk.confidence,
            lk.created_at
        FROM leaked_keys lk
        LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
        WHERE 
            (filter_type IS NULL OR lk.key_type = filter_type)
            AND (filter_status IS NULL OR lk.status = filter_status)
            AND (filter_severity IS NULL OR lk.severity = filter_severity)
            AND (
                search_query IS NULL 
                OR search_query = ''
                OR lk.repo_name ILIKE '%' || search_query || '%'
                OR lk.file_path ILIKE '%' || search_query || '%'
                OR lk.key_preview ILIKE '%' || search_query || '%'
                OR lk.context_preview ILIKE '%' || search_query || '%'
                OR lk.repo_language ILIKE '%' || search_query || '%'
                OR lk.key_type ILIKE '%' || search_query || '%'
                OR lks.raw_context ILIKE '%' || search_query || '%'
            )
    )
    SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_count,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity_count,
        COUNT(CASE WHEN status = 'valid' THEN 1 END) as verified_count,
        COUNT(CASE WHEN status = 'unknown' THEN 1 END) as unknown_count,
        COUNT(CASE WHEN status = 'valid' THEN 1 END) as valid_count,
        COUNT(CASE WHEN status = 'invalid' THEN 1 END) as invalid_count,
        -- 按类型聚合
        jsonb_object_agg(
            COALESCE(key_type, 'unknown'), 
            COUNT(*) FILTER (WHERE key_type IS NOT NULL)
        ) FILTER (WHERE key_type IS NOT NULL) as by_type,
        -- 按严重程度聚合
        jsonb_object_agg(
            COALESCE(severity, 'unknown'), 
            COUNT(*) FILTER (WHERE severity IS NOT NULL)
        ) FILTER (WHERE severity IS NOT NULL) as by_severity,
        -- 按置信度聚合
        jsonb_object_agg(
            COALESCE(confidence, 'unknown'), 
            COUNT(*) FILTER (WHERE confidence IS NOT NULL)
        ) FILTER (WHERE confidence IS NOT NULL) as by_confidence
    FROM filtered_data;
$$;

-- 创建快速计数函数（用于总数显示）
CREATE OR REPLACE FUNCTION get_total_keys_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT COUNT(*) FROM leaked_keys;
$$;

-- 权限设置
GRANT EXECUTE ON FUNCTION get_keys_paginated(integer, integer, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_keys_paginated(integer, integer, text, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION get_keys_statistics(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_keys_statistics(text, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION get_total_keys_count() TO anon;
GRANT EXECUTE ON FUNCTION get_total_keys_count() TO authenticated;

-- 测试查询
SELECT 'Testing paginated RPC functions:' as test;

-- 测试分页查询（第1页，每页10条）
SELECT 'Page 1 (10 records):' as test_page_1;
SELECT id, key_type, status, total_count 
FROM get_keys_paginated(10, 0) 
LIMIT 5;

-- 测试统计查询
SELECT 'Statistics test:' as test_stats;
SELECT * FROM get_keys_statistics();

-- 测试总数查询
SELECT 'Total count test:' as test_total;
SELECT get_total_keys_count() as total_keys;