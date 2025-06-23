-- 清理孤立的密钥记录（没有对应敏感数据的主记录）
-- 解决"完整密钥数据未找到"问题

-- 首先统计孤立记录数量
SELECT 
    '孤立记录统计' as info,
    COUNT(*) as orphaned_count
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lks.key_id IS NULL;

-- 删除孤立记录（没有对应敏感数据的主记录）
WITH orphaned_keys AS (
    SELECT lk.id
    FROM leaked_keys lk
    LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
    WHERE lks.key_id IS NULL
)
DELETE FROM leaked_keys
WHERE id IN (SELECT id FROM orphaned_keys);

-- 验证清理结果
SELECT 
    '清理后统计' as info,
    COUNT(*) as remaining_orphaned_count
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lks.key_id IS NULL;

-- 额外清理：删除敏感数据表中full_key为空或NULL的记录
DELETE FROM leaked_keys_sensitive 
WHERE full_key IS NULL OR full_key = '';

-- 再次验证数据完整性
SELECT 
    '最终数据完整性检查' as info,
    COUNT(DISTINCT lk.id) as total_main_keys,
    COUNT(DISTINCT lks.key_id) as total_sensitive_keys,
    COUNT(DISTINCT lk.id) - COUNT(DISTINCT lks.key_id) as orphaned_difference
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id;

-- 显示总体统计
SELECT 
    'Valid keys with complete data' as status,
    COUNT(*) as count
FROM leaked_keys lk
INNER JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lks.full_key IS NOT NULL AND lks.full_key != '';