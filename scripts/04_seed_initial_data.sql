-- Seed initial KPI data for scenarios
DO $$
DECLARE
    scenario_50k_id UUID;
    scenario_200k_id UUID;
BEGIN
    -- Get scenario IDs
    SELECT id INTO scenario_50k_id FROM scenarios WHERE name = '50k';
    SELECT id INTO scenario_200k_id FROM scenarios WHERE name = '200k';
    
    -- Insert KPIs for 50k scenario
    -- Removed Customer Satisfaction KPI for internal manufacturing use pre-market launch
    INSERT INTO kpis (scenario_id, name, target_value, current_value, unit, owner) VALUES
    (scenario_50k_id, 'Production Efficiency', 85.0, 78.5, '%', 'Operations Team'),
    (scenario_50k_id, 'Quality Score', 95.0, 92.3, '%', 'Quality Team'),
    (scenario_50k_id, 'Cost Reduction', 15.0, 12.8, '%', 'Finance Team'),
    (scenario_50k_id, 'Time to Market', 6.0, 7.2, 'months', 'Product Team')
    ON CONFLICT DO NOTHING;
    
    -- Insert KPIs for 200k scenario
    -- Removed Customer Satisfaction KPI for internal manufacturing use pre-market launch
    INSERT INTO kpis (scenario_id, name, target_value, current_value, unit, owner) VALUES
    (scenario_200k_id, 'Production Efficiency', 90.0, 82.1, '%', 'Operations Team'),
    (scenario_200k_id, 'Quality Score', 97.0, 94.8, '%', 'Quality Team'),
    (scenario_200k_id, 'Cost Reduction', 25.0, 18.5, '%', 'Finance Team'),
    (scenario_200k_id, 'Time to Market', 4.0, 5.8, 'months', 'Product Team')
    ON CONFLICT DO NOTHING;
    
    -- Insert cost data for scenarios
    INSERT INTO cost_data (scenario_id, capex, opex, cost_per_unit) VALUES
    (scenario_50k_id, 105050.00, 1603200.00, 32.06),
    (scenario_200k_id, 184910.00, 5519520.00, 27.60)
    ON CONFLICT DO NOTHING;
END $$;
