-- 创建Supabase Auth用户的SQL脚本
-- 在Supabase SQL编辑器中执行

-- ===============================
-- 检查现有Auth用户
-- ===============================

-- 查看是否已存在auth用户
SELECT 'Checking existing auth users:' as info;
SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    updated_at
FROM auth.users 
WHERE email = 'admin@test.com';

-- ===============================
-- 方案1：使用SQL创建Auth用户
-- ===============================

-- 如果上面查询没有结果，执行下面的插入语句
-- 创建auth用户（密码会被bcrypt加密）

INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'admin@test.com',
    crypt('temp123', gen_salt('bf')),  -- bcrypt加密密码
    NOW(),                             -- 邮箱已确认
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '',
    '',
    '',
    ''
) ON CONFLICT (email) DO NOTHING;  -- 如果已存在则跳过

-- ===============================
-- 验证Auth用户创建成功
-- ===============================

SELECT 'Auth user verification:' as info;
SELECT 
    id,
    email,
    email_confirmed_at IS NOT NULL as email_confirmed,
    created_at
FROM auth.users 
WHERE email = 'admin@test.com';

-- ===============================
-- 验证admin_users表记录
-- ===============================

SELECT 'Database user verification:' as info;
SELECT 
    id,
    email,
    role,
    created_at
FROM admin_users 
WHERE email = 'admin@test.com';

-- ===============================
-- 如果SQL方案不工作的手动步骤
-- ===============================

/*
如果上面的SQL插入失败，请使用Supabase Dashboard手动创建：

1. 访问 Supabase Dashboard
2. 点击 Authentication > Users  
3. 点击 "Add User" 按钮
4. 填写信息：
   - Email: admin@test.com
   - Password: temp123
   - ✅ 勾选 "Auto Confirm User"
5. 点击 "Create User"

创建后再次运行验证查询确认成功。
*/

SELECT '✅ Auth user setup completed!' as status;