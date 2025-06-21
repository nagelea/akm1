-- 诊断数据库状态SQL
-- 检查leaked_keys_sensitive表是否为空的问题

-- ===============================
-- 1. 检查两个表的数据计数
-- ===============================

SELECT '=== TABLE COUNTS ===' as info;

-- 主表记录数
SELECT 
    'leaked_keys count' as table_name,
    COUNT(*) as record_count
FROM leaked_keys;

-- 敏感数据表记录数
SELECT 
    'leaked_keys_sensitive count' as table_name,
    COUNT(*) as record_count
FROM leaked_keys_sensitive;

-- ===============================
-- 2. 检查数据关联状态
-- ===============================

SELECT '=== JOIN ANALYSIS ===' as info;

-- 有敏感数据的记录数
SELECT 
    'keys with sensitive data' as type,
    COUNT(*) as count
FROM leaked_keys lk
INNER JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id;

-- 缺少敏感数据的记录数
SELECT 
    'keys missing sensitive data' as type,
    COUNT(*) as count
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lks.key_id IS NULL;

-- ===============================
-- 3. 检查最近的记录创建时间
-- ===============================

SELECT '=== RECENT RECORDS ===' as info;

-- 最近的主表记录
SELECT 
    'latest leaked_keys' as type,
    MAX(created_at) as latest_record,
    COUNT(*) as total_today
FROM leaked_keys
WHERE DATE(created_at) = CURRENT_DATE;

-- 最近的敏感数据记录
SELECT 
    'latest leaked_keys_sensitive' as type,
    MAX(created_at) as latest_record,
    COUNT(*) as total_today
FROM leaked_keys_sensitive
WHERE DATE(created_at) = CURRENT_DATE;

-- ===============================
-- 4. 检查表结构和权限
-- ===============================

SELECT '=== TABLE STRUCTURE ===' as info;

-- 检查leaked_keys_sensitive表是否存在
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'leaked_keys_sensitive';

-- 检查列结构
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'leaked_keys_sensitive'
ORDER BY ordinal_position;

-- ===============================
-- 5. 显示一些示例数据（不包含敏感信息）
-- ===============================

SELECT '=== SAMPLE DATA ===' as info;

-- 显示最近5条主表记录的基本信息
SELECT 
    id,
    key_type,
    key_preview,
    repo_name,
    created_at,
    'main_table' as source
FROM leaked_keys
ORDER BY created_at DESC
LIMIT 5;

-- 显示最近5条敏感表记录的基本信息（不显示完整密钥）
SELECT 
    key_id,
    CASE 
        WHEN LENGTH(full_key) > 0 THEN CONCAT(LEFT(full_key, 6), '***', RIGHT(full_key, 4))
        ELSE 'NULL_OR_EMPTY'
    END as key_sample,
    created_at,
    'sensitive_table' as source
FROM leaked_keys_sensitive
ORDER BY created_at DESC
LIMIT 5;

-- ===============================
-- 6. 检查RLS策略状态
-- ===============================

SELECT '=== RLS POLICIES ===' as info;

-- 检查RLS是否启用
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('leaked_keys', 'leaked_keys_sensitive');

SELECT '=== DIAGNOSIS COMPLETE ===' as status;