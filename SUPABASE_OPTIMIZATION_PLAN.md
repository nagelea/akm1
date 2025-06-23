# Supabase查询优化方案

## 🔍 发现的问题

您提到的关键问题：
1. **1000行硬性限制**：`https://your-url/rest/v1/rpc/get_keys_with_sensitive_data` 最多返回1000条
2. **重复获取全部数据**：每次刷新都重新获取所有数据，效率低下

## 📊 当前状况分析

### URL 1: RPC函数调用
```
https://uggzdzixrykmexoutqbj.supabase.co/rest/v1/rpc/get_keys_with_sensitive_data
```
- **问题**：默认限制1000条，无分页参数
- **影响**：SensitiveKeysList组件无法获取完整数据
- **当前行为**：每次fetchKeys()都重新获取前1000条

### URL 2: 直接表查询  
```
https://uggzdzixrykmexoutqbj.supabase.co/rest/v1/leaked_keys?select=id,severity,confidence,status,created_at
```
- **问题**：AdminDashboard统计查询，获取全部记录用于客户端计算
- **影响**：数据传输量大，计算在客户端进行
- **已修复**：改用聚合查询避免传输大量数据

## 🛠️ 优化方案

### 1. 实现真正的分页查询

**当前问题**：
```javascript
// ❌ 现在：获取大量数据，前端分页
const { data } = await supabase.rpc('get_keys_with_sensitive_data', { limit_count: 5000 })
setPaginatedKeys(filteredKeys.slice(startIndex, endIndex))
```

**优化方案**：
```javascript
// ✅ 建议：数据库级分页
const { data } = await supabase
  .rpc('get_keys_with_sensitive_data')
  .range(startIndex, endIndex)
```

### 2. 创建分页版本的RPC函数

创建新的SQL函数支持offset/limit分页：

```sql
CREATE OR REPLACE FUNCTION get_keys_paginated(
  page_size integer DEFAULT 20,
  page_offset integer DEFAULT 0,
  filter_type text DEFAULT NULL,
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  -- 相同的返回结构
  id bigint,
  key_type text,
  -- ... 其他字段
  total_count bigint  -- 添加总数统计
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH filtered_data AS (
    SELECT lk.*, lks.full_key, lks.raw_context, lks.github_url
    FROM leaked_keys lk
    LEFT JOIN leaked_keys_sensitive lks ON lk.id = lks.key_id
    WHERE 
      (filter_type IS NULL OR lk.key_type = filter_type)
      AND (filter_status IS NULL OR lk.status = filter_status)
  ),
  total_rows AS (
    SELECT COUNT(*) as total_count FROM filtered_data
  )
  SELECT 
    fd.*,
    tr.total_count
  FROM filtered_data fd
  CROSS JOIN total_rows tr
  ORDER BY fd.created_at DESC
  LIMIT page_size
  OFFSET page_offset;
$$;
```

### 3. 优化前端数据获取

**修改SensitiveKeysList组件**：

```javascript
const [pagination, setPagination] = useState({
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 0
});

const fetchKeysPage = async (page = 1, pageSize = 20) => {
  try {
    const offset = (page - 1) * pageSize;
    
    // 使用分页RPC函数
    const { data, error } = await supabase.rpc('get_keys_paginated', {
      page_size: pageSize,
      page_offset: offset,
      filter_type: filters.keyType !== 'all' ? filters.keyType : null,
      filter_status: filters.status !== 'all' ? filters.status : null
    });
    
    if (data && data.length > 0) {
      const totalCount = data[0].total_count;
      setKeys(data);
      setPagination({
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      });
    }
  } catch (error) {
    console.error('Paginated fetch failed:', error);
  }
};
```

### 4. 添加URL参数管理

支持通过URL参数控制分页：

```javascript
// 支持URL参数: ?page=2&size=50&type=openai&status=unknown
const updateURLParams = (page, pageSize, filters) => {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', page);
  if (pageSize !== 20) params.set('size', pageSize);
  if (filters.keyType !== 'all') params.set('type', filters.keyType);
  if (filters.status !== 'all') params.set('status', filters.status);
  
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
};
```

### 5. 缓存和性能优化

**添加查询缓存**：
```javascript
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

const getCachedQuery = (key) => {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const setCachedQuery = (key, data) => {
  queryCache.set(key, { data, timestamp: Date.now() });
};
```

### 6. 渐进式加载

**无限滚动加载**：
```javascript
const [hasNextPage, setHasNextPage] = useState(true);
const [isLoadingMore, setIsLoadingMore] = useState(false);

const loadMoreKeys = async () => {
  if (!hasNextPage || isLoadingMore) return;
  
  setIsLoadingMore(true);
  const nextPage = pagination.page + 1;
  
  const newData = await fetchKeysPage(nextPage, pagination.pageSize);
  if (newData.length < pagination.pageSize) {
    setHasNextPage(false);
  }
  
  // 追加到现有数据
  setKeys(prevKeys => [...prevKeys, ...newData]);
  setIsLoadingMore(false);
};
```

## 📈 性能改进预期

### 当前性能问题
- 🔴 **数据传输**：每次获取5000+条记录
- 🔴 **内存使用**：客户端存储大量数据
- 🔴 **响应时间**：大查询导致加载缓慢
- 🔴 **带宽消耗**：重复传输相同数据

### 优化后性能
- 🟢 **数据传输**：每次仅获取20-50条记录
- 🟢 **内存使用**：显著减少客户端内存占用
- 🟢 **响应时间**：快速加载小批量数据
- 🟢 **带宽节省**：减少90%+的数据传输

### 实施优先级

**Phase 1 (高优先级)**:
1. ✅ 修复统计查询（已完成）
2. 🔄 创建分页RPC函数
3. 🔄 修改SensitiveKeysList使用分页

**Phase 2 (中优先级)**:
4. 添加URL参数支持
5. 实现查询缓存
6. 优化搜索和筛选

**Phase 3 (低优先级)**:
7. 无限滚动加载
8. 预加载机制
9. 离线支持

## 🧪 测试方案

```javascript
// 性能测试脚本
async function performanceTest() {
  console.time('Old method (5000 records)');
  await supabase.rpc('get_keys_with_sensitive_data', { limit_count: 5000 });
  console.timeEnd('Old method (5000 records)');
  
  console.time('New method (20 records, paginated)');
  await supabase.rpc('get_keys_paginated', { page_size: 20, page_offset: 0 });
  console.timeEnd('New method (20 records, paginated)');
}
```

这个优化方案将显著改善用户体验，减少数据传输，提高响应速度。