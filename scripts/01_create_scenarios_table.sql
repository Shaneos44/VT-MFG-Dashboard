-- Create scenarios table to store different production scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  target_units INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default scenarios
INSERT INTO scenarios (name, description, target_units) VALUES
('50k', '50,000 units production scenario', 50000),
('200k', '200,000 units production scenario', 200000)
ON CONFLICT DO NOTHING;
