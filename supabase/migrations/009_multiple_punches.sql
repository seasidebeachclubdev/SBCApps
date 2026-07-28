-- Employees can clock in and out multiple times per day (split shifts).
-- The old one-row-per-day unique index becomes a partial index: any number
-- of completed punches, but only one OPEN punch per employee per day -
-- which still blocks the accidental-duplicate bug at the database level.
drop index if exists public.clock_records_employee_day_uidx;

create unique index clock_records_one_open_uidx
  on public.clock_records (employee_id, shift_date)
  where clock_out is null;
