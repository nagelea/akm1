-- 检查密钥验证状态问题

-- 1. 查看当前状态分布
SELECT 
    'Current Status Distribution:' as info,
    status,
    COUNT(*) as count
FROM leaked_keys 
GROUP BY status
ORDER BY count DESC;

-- 2. 查看最近验证记录
SELECT 
    'Recent Verification Records:' as info,
    id,
    key_type,
    status,
    last_verified,
    created_at
FROM leaked_keys 
WHERE last_verified IS NOT NULL
ORDER BY last_verified DESC
LIMIT 5;

-- 3. 查看所有记录的状态
SELECT 
    'All Records Status:' as info,
    id,
    key_type,
    status,
    last_verified,
    created_at
FROM leaked_keys 
ORDER BY created_at DESC
LIMIT 10;

-- 4. 更新一些测试状态 (可选)
-- 将前3个记录标记为不同状态用于测试
UPDATE leaked_keys 
SET 
    status = CASE 
        WHEN id % 3 = 0 THEN 'valid'
        WHEN id % 3 = 1 THEN 'invalid' 
        ELSE 'unknown'
    END,
    last_verified = NOW()
WHERE id IN (
    SELECT id FROM leaked_keys 
    ORDER BY created_at DESC 
    LIMIT 5
);

-- 5. 验证更新结果
SELECT 
    'Updated Status Distribution:' as info,
    status,
    COUNT(*) as count
FROM leaked_keys 
GROUP BY status
ORDER BY count DESC;

SELECT '✅ Verification status check completed!' as status;