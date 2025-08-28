-- Remove customer satisfaction KPIs for internal manufacturing dashboard
-- This is for pre-market launch internal use, so customer satisfaction metrics are not relevant

DELETE FROM kpis 
WHERE name = 'Customer Satisfaction';

-- Optional: Also remove any KPI history for customer satisfaction
DELETE FROM kpi_history 
WHERE kpi_id IN (
    SELECT id FROM kpis WHERE name = 'Customer Satisfaction'
);
