-- 简化的Session修复脚本
-- 避免使用不存在的列

-- 1. 重置RLS策略到工作状态
ALTER TABLE leaked_keys_sensitive DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaked_keys_sensitive ENABLE ROW LEVEL SECURITY;

-- 2. 删除所有现有策略
DROP POLICY IF EXISTS "Allow anonymous read access" ON leaked_keys_sensitive;
DROP POLICY IF EXISTS "Allow authenticated read access" ON leaked_keys_sensitive;
DROP POLICY IF EXISTS "Allow admin read access" ON leaked_keys_sensitive;
DROP POLICY IF EXISTS "Allow all read access" ON leaked_keys_sensitive;

-- 3. 创建最简单的读取策略
CREATE POLICY "Enable read access for all users" 
ON leaked_keys_sensitive
FOR SELECT 
USING (true);

-- 4. 确保主表策略也正常
DROP POLICY IF EXISTS "Allow public read access" ON leaked_keys;
DROP POLICY IF EXISTS "Enable read access for all users" ON leaked_keys;

CREATE POLICY "Enable read access for all users" 
ON leaked_keys
FOR SELECT 
USING (true);

-- 5. 验证策略创建成功
SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE tablename IN ('leaked_keys', 'leaked_keys_sensitive');

-- 6. 测试查询 - 应该返回数据
SELECT 
    'Test query result:' as info,
    COUNT(*) as total_records
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id;

SELECT '✅ Simple session fix completed!' as status;