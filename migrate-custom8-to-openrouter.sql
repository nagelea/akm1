-- 将数据库中现有的 custom_8 类型更新为 openrouter
-- 这样现有的 OpenRouter 密钥就能正常验证了

UPDATE leaked_keys 
SET key_type = 'openrouter' 
WHERE key_type = 'custom_8';

-- 显示更新结果
SELECT 
  'Updated custom_8 to openrouter' as action,
  COUNT(*) as affected_rows
FROM leaked_keys 
WHERE key_type = 'openrouter';

-- 验证没有 custom_8 类型的记录了
SELECT 
  'Remaining custom_8 records' as check_result,
  COUNT(*) as count
FROM leaked_keys 
WHERE key_type = 'custom_8';