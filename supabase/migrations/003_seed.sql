-- Seaside Beach Club - seed data

-- Single-row beach flag with the fixed UUID the apps upsert against.
insert into public.beach_flag (id, color)
values ('00000000-0000-0000-0000-000000000001', 'green')
on conflict (id) do nothing;
