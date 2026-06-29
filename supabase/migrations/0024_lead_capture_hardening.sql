-- T10a: make the monthly lead_capture conversion row concurrency-safe.

create unique index if not exists idx_conversion_outcomes_brand_source_period
  on public.conversion_outcomes (brand_id, source, period_start, period_end);

notify pgrst, 'reload schema';
