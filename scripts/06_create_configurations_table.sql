-- Create configurations table to store saved dashboard configurations
CREATE TABLE IF NOT EXISTS configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  data JSONB NOT NULL,
  modified_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_configurations_name ON configurations(name);
CREATE INDEX IF NOT EXISTS idx_configurations_created_at ON configurations(created_at);
CREATE INDEX IF NOT EXISTS idx_configurations_modified_by ON configurations(modified_by);
