-- 修复 visitor_stats 表的 RLS 策略，允许更新地理位置数据

-- 删除可能存在的旧策略
DROP POLICY IF EXISTS "Allow update for service role" ON visitor_stats;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON visitor_stats;

-- 创建新的更新策略：允许服务角色更新地理位置字段
CREATE POLICY "Allow update for service role" ON visitor_stats
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- 创建策略：允许认证用户更新自己的访问记录（可选）
CREATE POLICY "Allow update for authenticated users" ON visitor_stats
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 验证策略
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'visitor_stats'
ORDER BY policyname;

-- 测试更新权限
-- SELECT 'RLS policies updated successfully for visitor_stats table' as result;