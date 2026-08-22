-- Schritt 1: Einkaufsliste-Persistenz
-- In Supabase SQL Editor ausführen

alter table week_plans
  add column if not exists shopping_list jsonb not null default '[]';
