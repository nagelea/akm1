-- 调试统计问题
-- 检查当前状态分布
SELECT 
    'Status Distribution' as info,
    status,
    COUNT(*) as count
FROM leaked_keys 
GROUP BY status
ORDER BY count DESC;

-- 检查最近的验证记录
SELECT 
    'Recent Valid Keys' as info,
    id,
    key_type,
    status,
    last_verified,
    created_at
FROM leaked_keys 
WHERE status = 'valid'
ORDER BY last_verified DESC
LIMIT 10;

-- 检查所有状态不是unknown的记录
SELECT 
    'Non-Unknown Status Keys' as info,
    id,
    key_type,
    status,
    last_verified
FROM leaked_keys 
WHERE status != 'unknown'
ORDER BY id DESC
LIMIT 10;