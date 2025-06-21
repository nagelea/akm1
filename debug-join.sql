-- 检查前端JOIN查询问题
-- 模拟前端的查询来找出问题

-- 1. 检查JOIN查询结果（模拟前端查询）
SELECT 
    lk.id,
    lk.key_type,
    lk.repo_name,
    lk.created_at,
    lks.full_key IS NOT NULL as has_sensitive_data,
    CASE 
        WHEN lks.full_key IS NOT NULL THEN 'HAS_DATA'
        ELSE 'MISSING_DATA'
    END as sensitive_status
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
ORDER BY lk.created_at DESC 
LIMIT 10;

-- 2. 检查数据ID匹配问题
SELECT 
    'leaked_keys max ID' as table_name,
    MAX(id) as max_id,
    COUNT(*) as total_records
FROM leaked_keys
UNION ALL
SELECT 
    'leaked_keys_sensitive max key_id' as table_name,
    MAX(key_id) as max_id,
    COUNT(*) as total_records
FROM leaked_keys_sensitive;

-- 3. 找出没有敏感数据的记录
SELECT 
    lk.id,
    lk.key_type,
    lk.repo_name,
    lk.created_at
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lks.key_id IS NULL
ORDER BY lk.created_at DESC
LIMIT 5;