-- Employees can leave a note on their day's clock record; managers read
-- them in the admin Employees view.
alter table public.clock_records add column if not exists note text;
