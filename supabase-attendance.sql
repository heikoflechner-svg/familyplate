-- Anwesenheit pro Tag (attendance)
-- In Supabase SQL Editor ausführen

alter table week_plans
  add column if not exists attendance jsonb not null default '[]';
