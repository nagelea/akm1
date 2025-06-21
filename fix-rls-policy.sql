-- 修复RLS策略循环引用问题
-- 在Supabase SQL编辑器中执行此文件

-- ===============================
-- 方案1：完全重置RLS策略
-- ===============================

-- 第1步：完全禁用admin_users的RLS
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;

-- 第2步：删除所有现有策略（避免冲突）
DROP POLICY IF EXISTS "Admin user management" ON admin_users;
DROP POLICY IF EXISTS "Allow anon read admin_users" ON admin_users;
DROP POLICY IF EXISTS "Service role admin_users" ON admin_users;
DROP POLICY IF EXISTS "Allow all read admin_users" ON admin_users;
DROP POLICY IF EXISTS "Service role all access admin_users" ON admin_users;
DROP POLICY IF EXISTS "admin_users_select_policy" ON admin_users;
DROP POLICY IF EXISTS "admin_users_service_policy" ON admin_users;

-- 第3步：测试基础查询是否正常
SELECT 'Testing basic query...' as step;
SELECT COUNT(*) as admin_count FROM admin_users;
SELECT email, role FROM admin_users WHERE email = 'admin@test.com';

-- 第4步：重新启用RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 第5步：创建简单的策略（不会产生循环引用）
CREATE POLICY "admin_users_read_all" ON admin_users
    FOR SELECT 
    USING (true);  -- 允许所有用户读取admin_users表

CREATE POLICY "admin_users_service_full" ON admin_users
    FOR ALL 
    USING (auth.role() = 'service_role');  -- 服务角色完全权限

-- 第6步：验证策略创建成功
SELECT 'Policies created:' as info;
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'admin_users';

-- 第7步：测试策略是否工作
SELECT 'Testing with new policies...' as step;
SELECT email, role FROM admin_users WHERE email = 'admin@test.com';

-- ===============================
-- 方案2：如果方案1还有问题，使用临时禁用
-- ===============================

-- 如果上面的策略还是有循环引用，执行下面的命令
-- 这会完全禁用admin_users表的RLS（临时解决方案）

-- ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;
-- SELECT 'RLS disabled for admin_users' as status;

-- ===============================
-- 验证最终结果
-- ===============================

-- 检查表的RLS状态
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'admin_users';

-- 检查所有策略
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    permissive,
    qual
FROM pg_policies 
WHERE tablename = 'admin_users';

-- 最终测试查询
SELECT 'Final test:' as info;
SELECT id, email, role, created_at FROM admin_users;

SELECT '✅ RLS policy fix completed!' as status;