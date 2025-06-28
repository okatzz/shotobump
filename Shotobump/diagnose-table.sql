-- Diagnostic Script - Check Current Table Structure
-- Run this first to see what we're working with

-- Check if table exists and show its structure
SELECT 'Checking user_song_stacks table structure...' as status;

-- Show all columns in the table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'user_song_stacks' 
ORDER BY ordinal_position;

-- Show table constraints
SELECT 
    constraint_name,
    constraint_type,
    column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'user_song_stacks';

-- Show indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'user_song_stacks';

SELECT 'Diagnosis complete!' as status; 