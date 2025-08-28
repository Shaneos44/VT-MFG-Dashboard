-- Create table to track KPI changes over time
CREATE TABLE IF NOT EXISTS public.kpi_history (
  id SERIAL PRIMARY KEY,
  kpi_id INTEGER REFERENCES public.kpis(id) ON DELETE CASCADE,
  scenario_id INTEGER REFERENCES public.scenarios(id) ON DELETE CASCADE,
  old_value DECIMAL(10,2),
  new_value DECIMAL(10,2),
  changed_by TEXT DEFAULT 'system',
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  change_reason TEXT
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_kpi_history_kpi_scenario ON public.kpi_history(kpi_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_kpi_history_changed_at ON public.kpi_history(changed_at);

-- Insert some sample historical data
INSERT INTO public.kpi_history (kpi_id, scenario_id, old_value, new_value, changed_by, changed_at, change_reason) VALUES
(1, 1, 45000, 50000, 'admin', NOW() - INTERVAL '30 days', 'Initial target adjustment'),
(1, 1, 50000, 52000, 'admin', NOW() - INTERVAL '15 days', 'Market expansion'),
(2, 1, 25, 30, 'admin', NOW() - INTERVAL '20 days', 'Process optimization'),
(3, 1, 85, 90, 'admin', NOW() - INTERVAL '10 days', 'Quality improvements'),
(1, 2, 180000, 200000, 'admin', NOW() - INTERVAL '25 days', 'Scale-up planning'),
(2, 2, 22, 25, 'admin', NOW() - INTERVAL '18 days', 'Efficiency gains');
