-- Create user_modifications table to track changes made by users
CREATE TABLE IF NOT EXISTS user_modifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  modified_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_modifications_table_record ON user_modifications(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_user_modifications_created_at ON user_modifications(created_at);
