-- Verify tables exist and have data, reseed if necessary
DO $$
BEGIN
    -- Check if scenarios table has data
    IF NOT EXISTS (SELECT 1 FROM scenarios LIMIT 1) THEN
        -- Insert scenarios if empty
        INSERT INTO scenarios (id, name, description, target_units) VALUES
        (gen_random_uuid(), '50k Units', 'Production scenario for 50,000 units annually', 50000),
        (gen_random_uuid(), '200k Units', 'Production scenario for 200,000 units annually', 200000);
        
        RAISE NOTICE 'Scenarios table was empty, inserted seed data';
    ELSE
        RAISE NOTICE 'Scenarios table already has data';
    END IF;
END $$;

-- Verify data exists
SELECT 'Scenarios count:' as info, count(*) as value FROM scenarios
UNION ALL
SELECT 'KPIs count:' as info, count(*) as value FROM kpis
UNION ALL
SELECT 'Cost data count:' as info, count(*) as value FROM cost_data;
