-- 清空Supabase数据库的完整脚本
-- ⚠️ 警告：此操作将删除所有数据，请谨慎执行！

-- ===============================
-- 清空所有表和相关对象
-- ===============================

-- 1. 删除所有视图
DROP VIEW IF EXISTS recent_keys CASCADE;
DROP VIEW IF EXISTS stats_summary CASCADE;

-- 2. 删除所有表（按依赖关系顺序）
DROP TABLE IF EXISTS access_logs CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS leaked_keys_sensitive CASCADE;
DROP TABLE IF EXISTS leaked_keys CASCADE;
DROP TABLE IF EXISTS daily_stats CASCADE;

-- 3. 删除所有函数
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- 4. 删除所有RLS策略（如果存在，防止冲突）
-- 注意：DROP POLICY 会在表不存在时报错，这是正常的

-- 5. 清理可能存在的其他对象
DROP SEQUENCE IF EXISTS leaked_keys_id_seq CASCADE;
DROP SEQUENCE IF EXISTS leaked_keys_sensitive_id_seq CASCADE;
DROP SEQUENCE IF EXISTS admin_users_id_seq CASCADE;
DROP SEQUENCE IF EXISTS access_logs_id_seq CASCADE;
DROP SEQUENCE IF EXISTS daily_stats_id_seq CASCADE;

-- 6. 确认清理完成
SELECT 'Database cleared successfully! Ready for rebuild.' as status;

-- ===============================
-- 验证清理结果
-- ===============================

-- 检查剩余的表
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('leaked_keys', 'leaked_keys_sensitive', 'admin_users', 'access_logs', 'daily_stats');

-- 检查剩余的视图
SELECT viewname 
FROM pg_views 
WHERE schemaname = 'public' 
    AND viewname IN ('recent_keys', 'stats_summary');

-- 检查剩余的函数
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name = 'update_updated_at_column';

-- 如果上面的查询都返回空结果，说明清理成功
SELECT '✅ All objects cleared. You can now run database-simple.sql' as next_step;