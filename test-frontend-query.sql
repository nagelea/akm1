-- 测试前端使用的确切查询
-- 模拟SensitiveKeysList.js中的查询

-- 这是前端使用的确切查询
SELECT 
    lk.*,
    lks.full_key,
    lks.raw_context,
    lks.github_url
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
ORDER BY lk.created_at DESC
LIMIT 10;

-- 检查特定记录
SELECT 
    'Specific record check:' as test,
    lk.id,
    lk.key_type,
    lk.repo_name,
    lks.key_id,
    lks.full_key,
    CASE 
        WHEN lks.full_key IS NULL THEN 'NULL'
        WHEN lks.full_key = '' THEN 'EMPTY'
        ELSE 'HAS_DATA'
    END as data_status
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lk.id = 96;