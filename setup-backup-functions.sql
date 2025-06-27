-- 创建智能备份所需的数据库函数
-- 在 Supabase SQL 编辑器中执行

-- 1. 创建获取用户表列表的函数
CREATE OR REPLACE FUNCTION get_user_tables()
RETURNS TABLE(table_name text, table_schema text, table_type text, row_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    count_query text;
    row_count bigint;
BEGIN
    -- 获取所有用户表
    FOR rec IN 
        SELECT t.table_name::text as tname, t.table_schema::text as tschema, t.table_type::text as ttype
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND t.table_name NOT LIKE 'pg_%'
          AND t.table_name NOT LIKE 'sql_%'
          AND t.table_name NOT LIKE '__%'  -- 排除系统表
        ORDER BY t.table_name
    LOOP
        -- 获取每个表的行数
        BEGIN
            count_query := format('SELECT COUNT(*) FROM %I.%I', rec.tschema, rec.tname);
            EXECUTE count_query INTO row_count;
        EXCEPTION WHEN OTHERS THEN
            row_count := -1; -- 表示无法访问
        END;
        
        table_name := rec.tname;
        table_schema := rec.tschema;
        table_type := rec.ttype;
        RETURN NEXT;
    END LOOP;
    
    RETURN;
END;
$$;

-- 2. 创建备份元数据表（可选，用于跟踪备份历史）
CREATE TABLE IF NOT EXISTS backup_history (
    id SERIAL PRIMARY KEY,
    backup_timestamp TIMESTAMP DEFAULT NOW(),
    backup_type VARCHAR(50) DEFAULT 'manual',
    tables_backed_up TEXT[],
    total_records INTEGER DEFAULT 0,
    backup_size_kb INTEGER DEFAULT 0,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

-- 3. 创建RLS策略
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role backup history access" ON backup_history
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin backup history access" ON backup_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE email = auth.jwt() ->> 'email' 
            AND role IN ('admin', 'viewer')
        )
    );

-- 4. 创建记录备份历史的函数
CREATE OR REPLACE FUNCTION record_backup_history(
    p_backup_type text DEFAULT 'manual',
    p_tables text[] DEFAULT '{}',
    p_total_records integer DEFAULT 0,
    p_backup_size_kb integer DEFAULT 0,
    p_success boolean DEFAULT true,
    p_error_message text DEFAULT null,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    backup_id integer;
BEGIN
    INSERT INTO backup_history (
        backup_type, 
        tables_backed_up, 
        total_records, 
        backup_size_kb, 
        success, 
        error_message, 
        metadata
    ) VALUES (
        p_backup_type,
        p_tables,
        p_total_records,
        p_backup_size_kb,
        p_success,
        p_error_message,
        p_metadata
    ) RETURNING id INTO backup_id;
    
    RETURN backup_id;
END;
$$;

-- 5. 创建获取备份统计的视图
CREATE OR REPLACE VIEW backup_stats AS
SELECT 
    backup_type,
    COUNT(*) as backup_count,
    AVG(total_records) as avg_records,
    AVG(backup_size_kb) as avg_size_kb,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate,
    MAX(backup_timestamp) as last_backup,
    MIN(backup_timestamp) as first_backup
FROM backup_history
GROUP BY backup_type
ORDER BY backup_type;

-- 启用视图的RLS
ALTER VIEW backup_stats SET (security_barrier = true);

-- 6. 创建清理旧备份记录的函数（保留最近30天）
CREATE OR REPLACE FUNCTION cleanup_backup_history(days_to_keep integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM backup_history 
    WHERE backup_timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_backup_history_timestamp ON backup_history(backup_timestamp);
CREATE INDEX IF NOT EXISTS idx_backup_history_type ON backup_history(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_history_success ON backup_history(success);

COMMENT ON FUNCTION get_user_tables() IS '获取数据库中所有用户表的列表和行数';
COMMENT ON FUNCTION record_backup_history(text, text[], integer, integer, boolean, text, jsonb) IS '记录备份操作的历史记录';
COMMENT ON FUNCTION cleanup_backup_history(integer) IS '清理指定天数之前的备份历史记录';
COMMENT ON TABLE backup_history IS '备份操作历史记录表';
COMMENT ON VIEW backup_stats IS '备份操作统计视图';