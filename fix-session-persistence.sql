-- 修复Session持久化问题的SQL脚本
-- 检查和修复认证相关问题

-- 1. 检查auth用户状态
SELECT 
    'Auth Users Status:' as info,
    COUNT(*) as total_users,
    COUNT(CASE WHEN email_confirmed_at IS NOT NULL THEN 1 END) as confirmed_users,
    COUNT(CASE WHEN last_sign_in_at > NOW() - INTERVAL '1 day' THEN 1 END) as recent_signins
FROM auth.users;

-- 2. 检查admin_users表状态
SELECT 
    'Admin Users Status:' as info,
    COUNT(*) as total_admins,
    string_agg(email, ', ') as admin_emails
FROM admin_users;

-- 3. 检查特定admin用户
SELECT 
    'Admin User Details:' as info,
    au.id as auth_id,
    au.email,
    au.email_confirmed_at,
    au.last_sign_in_at,
    au.created_at,
    ad.role as admin_role
FROM auth.users au
LEFT JOIN admin_users ad ON au.email = ad.email
WHERE au.email = 'admin@test.com';

-- 4. 更新admin用户确保邮箱已确认
UPDATE auth.users 
SET 
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email = 'admin@test.com';

-- 5. 确保admin_users记录存在
INSERT INTO admin_users (email, role, created_at)
VALUES ('admin@test.com', 'admin', NOW())
ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    updated_at = NOW();

-- 6. 清理可能的重复session
-- 注意：这个操作会登出所有用户，请谨慎使用
-- DELETE FROM auth.sessions WHERE expires_at < NOW();

-- 7. 检查RLS策略状态
SELECT 
    'RLS Policy Status:' as info,
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('admin_users', 'leaked_keys', 'leaked_keys_sensitive');

-- 8. 验证最终状态
SELECT 
    'Final Verification:' as info,
    au.email,
    au.email_confirmed_at IS NOT NULL as email_confirmed,
    ad.role,
    ad.created_at as admin_since
FROM auth.users au
JOIN admin_users ad ON au.email = ad.email
WHERE au.email = 'admin@test.com';

SELECT '✅ Session persistence fix completed!' as status;