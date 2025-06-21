-- 数据库增量更新 - 添加置信度字段
-- 在Supabase SQL编辑器中执行

-- 添加置信度字段（如果不存在）
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leaked_keys' 
        AND column_name = 'confidence'
    ) THEN
        ALTER TABLE leaked_keys 
        ADD COLUMN confidence VARCHAR(10) DEFAULT 'medium';
        
        -- 添加注释
        COMMENT ON COLUMN leaked_keys.confidence IS '检测置信度: high, medium, low';
        
        -- 创建索引
        CREATE INDEX idx_leaked_keys_confidence ON leaked_keys(confidence);
        
        -- 更新现有记录的置信度
        UPDATE leaked_keys 
        SET confidence = CASE 
            WHEN key_type IN ('openai', 'anthropic', 'google', 'huggingface', 'replicate') THEN 'high'
            WHEN key_type IN ('cohere', 'stability') THEN 'medium'
            ELSE 'low'
        END;
        
        RAISE NOTICE '✅ 置信度字段添加成功';
    ELSE
        RAISE NOTICE '⚠️ 置信度字段已存在，跳过添加';
    END IF;
END $$;