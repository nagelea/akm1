-- 调试分页函数类型问题
-- 先测试一个简单的查询来找出具体是哪个字段有问题

-- 测试基础查询，看看实际返回的数据类型
SELECT 
  lk.id,
  lk.key_type,
  lk.key_preview,
  lk.severity,
  lk.confidence,
  lk.status,
  lk.repo_name,
  lk.file_path,
  lk.repo_language,
  lk.first_seen,
  lk.last_verified,
  lk.context_preview,
  lks.full_key,
  lks.raw_context,
  lks.github_url
FROM leaked_keys lk
LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
LIMIT 1;