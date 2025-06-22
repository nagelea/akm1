-- 检查RLS权限问题
-- 查看leaked_keys表的RLS策略
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'leaked_keys';

-- 检查当前用户是否有更新权限
SELECT 
    table_name,
    privilege_type,
    grantee,
    grantor
FROM information_schema.table_privileges 
WHERE table_name = 'leaked_keys' 
AND privilege_type = 'UPDATE';

-- 尝试直接更新一条记录（测试权限）
UPDATE leaked_keys 
SET status = 'valid', last_verified = NOW()
WHERE id = (SELECT id FROM leaked_keys ORDER BY id DESC LIMIT 1);

-- 检查更新是否成功
SELECT id, status, last_verified 
FROM leaked_keys 
ORDER BY id DESC 
LIMIT 5;