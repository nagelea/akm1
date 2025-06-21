-- 简化诊断SQL - 逐步检查
-- 如果某个查询失败，在Supabase中分别执行每个查询

-- 1. 检查主表记录数
SELECT COUNT(*) as leaked_keys_count FROM leaked_keys;

-- 2. 检查敏感表记录数  
SELECT COUNT(*) as leaked_keys_sensitive_count FROM leaked_keys_sensitive;

-- 3. 检查敏感表是否存在
SELECT table_name FROM information_schema.tables WHERE table_name = 'leaked_keys_sensitive';

-- 4. 显示最近5条主表记录
SELECT id, key_type, repo_name, created_at FROM leaked_keys ORDER BY created_at DESC LIMIT 5;

-- 5. 显示敏感表中的记录ID（如果有）
SELECT key_id, created_at FROM leaked_keys_sensitive ORDER BY created_at DESC LIMIT 5;