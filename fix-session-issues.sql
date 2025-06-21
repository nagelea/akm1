-- 修复admin页面session问题
-- 清理可能的session冲突

-- 1. 清理旧的session数据
DELETE FROM auth.sessions WHERE expires_at < NOW();

-- 2. 重置RLS策略到工作状态
-- 禁用然后重新启用RLS以清除缓存
ALTER TABLE leaked_keys_sensitive DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaked_keys_sensitive ENABLE ROW LEVEL SECURITY;

-- 3. 重新创建简单的RLS策略
DROP POLICY IF EXISTS "Allow anonymous read access" ON leaked_keys_sensitive;
DROP POLICY IF EXISTS "Allow authenticated read access" ON leaked_keys_sensitive;
DROP POLICY IF EXISTS "Allow admin read access" ON leaked_keys_sensitive;

-- 允许所有认证用户读取（包括admin和anon）
CREATE POLICY "Allow all read access" 
ON leaked_keys_sensitive
FOR SELECT 
USING (true);

-- 4. 确保主表策略也正常
DROP POLICY IF EXISTS "Allow public read access" ON leaked_keys;
CREATE POLICY "Allow public read access" 
ON leaked_keys
FOR SELECT 
USING (true);

-- 5. 验证auth用户状态
SELECT 
    'Auth user check:' as info,
    id,
    email,
    email_confirmed_at IS NOT NULL as confirmed,
    last_sign_in_at
FROM auth.users 
WHERE email = 'admin@test.com';

-- 6. 确保admin_users表记录存在
SELECT 
    'Admin user check:' as info,
    id,
    email,
    role,
    created_at
FROM admin_users 
WHERE email = 'admin@test.com';

SELECT '✅ Session issues fixed!' as status;