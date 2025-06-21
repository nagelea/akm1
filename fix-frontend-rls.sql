-- 修复前端RLS权限问题
-- 前端可能因为RLS策略无法读取敏感数据

-- 1. 检查当前RLS策略
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('leaked_keys', 'leaked_keys_sensitive');

-- 2. 临时禁用leaked_keys_sensitive的RLS以测试
-- （仅用于诊断，生产环境需要谨慎）
ALTER TABLE leaked_keys_sensitive DISABLE ROW LEVEL SECURITY;

-- 3. 或者添加允许匿名用户读取的策略
DROP POLICY IF EXISTS "Allow anonymous read access" ON leaked_keys_sensitive;

CREATE POLICY "Allow anonymous read access" 
ON leaked_keys_sensitive
FOR SELECT 
TO anon
USING (true);

-- 4. 确保RLS已启用但有正确的策略
ALTER TABLE leaked_keys_sensitive ENABLE ROW LEVEL SECURITY;

-- 5. 测试查询（模拟前端调用）
SELECT 
    lk.*,
    lks.full_key,
    lks.raw_context,
    lks.github_url
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
WHERE lk.id IN (92, 93, 94, 95, 96)
ORDER BY lk.created_at DESC;