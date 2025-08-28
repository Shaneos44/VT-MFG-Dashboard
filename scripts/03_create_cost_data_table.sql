-- Create cost_data table to store cost analysis information
CREATE TABLE IF NOT EXISTS cost_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
  capex DECIMAL(15,2) NOT NULL,
  opex DECIMAL(15,2) NOT NULL,
  cost_per_unit DECIMAL(10,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_cost_data_scenario_id ON cost_data(scenario_id);
