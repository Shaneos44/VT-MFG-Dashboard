-- Remove Customer Satisfaction KPIs from database
-- This is for internal manufacturing use pre-market launch

-- Delete Customer Satisfaction KPIs from all scenarios
DELETE FROM kpis 
WHERE name = 'Customer Satisfaction' 
   OR name LIKE '%Customer Satisfaction%'
   OR name LIKE '%customer satisfaction%';

-- Verify remaining KPIs are manufacturing-focused
SELECT 
    s.name as scenario_name,
    k.name as kpi_name,
    k.target_value,
    k.current_value,
    k.unit,
    k.owner
FROM kpis k
JOIN scenarios s ON k.scenario_id = s.id
ORDER BY s.name, k.name;

-- Expected KPIs after cleanup:
-- - Production Efficiency
-- - Quality Score  
-- - Cost Reduction
-- - Time to Market
