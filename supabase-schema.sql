-- FamilyPlate Supabase Schema
-- Einmalig im Supabase SQL Editor ausführen

-- Wochenpläne (Rémy-generiert)
create table if not exists week_plans (
  id uuid default gen_random_uuid() primary key,
  family_id text default 'flechner' not null,
  plan_data jsonb not null default '[]',
  meals_data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Gefriertruhe-Einträge
create table if not exists freezer_items (
  id uuid default gen_random_uuid() primary key,
  family_id text default 'flechner' not null,
  typ text not null default 'fertig',
  emoji text default '🍲',
  name text not null,
  menge text default '',
  datum text default '',
  ampel text default 'green',
  created_at timestamptz default now()
);

-- Speisekammer-Einträge
create table if not exists pantry_items (
  id uuid default gen_random_uuid() primary key,
  family_id text default 'flechner' not null,
  emoji text default '🗄️',
  name text not null,
  menge text default '',
  ampel text default 'green',
  created_at timestamptz default now()
);

-- Gespeicherte Rezepte
create table if not exists saved_recipes (
  id uuid default gen_random_uuid() primary key,
  family_id text default 'flechner' not null,
  name text not null,
  emoji text default '🍽',
  created_at timestamptz default now()
);

-- Starter-Daten für Gefriertruhe
insert into freezer_items (family_id, typ, emoji, name, menge, datum, ampel) values
  ('flechner', 'fertig', '🥗', 'Lasagne', '2 Portionen', '12. Jun', 'yellow'),
  ('flechner', 'fertig', '🍲', 'Gemüsecurry', '3 Portionen', '18. Jun', 'green'),
  ('flechner', 'roh', '🍗', 'Hühnerfilets', '500g', '10. Jun', 'green'),
  ('flechner', 'roh', '🐟', 'Lachs', '400g', '15. Jun', 'green'),
  ('flechner', 'roh', '🥩', 'Hackfleisch', '300g', '1. Jun', 'red');

-- Starter-Daten für Speisekammer
insert into pantry_items (family_id, emoji, name, menge, ampel) values
  ('flechner', '🍝', 'Spaghetti', '500g', 'green'),
  ('flechner', '🍚', 'Reis', '1kg', 'green'),
  ('flechner', '🍜', 'Penne', 'ca. 200g', 'yellow'),
  ('flechner', '🍅', 'Tomatensoße', '2 Gläser', 'green'),
  ('flechner', '🫘', 'Kichererbsen', 'leer', 'red');

-- Migration: Wunsch-System (einmalig ausführen, falls week_plans bereits existiert)
alter table week_plans add column if not exists wishes jsonb not null default '[]';

-- Row Level Security (für später, wenn Auth eingebaut wird)
alter table week_plans enable row level security;
alter table freezer_items enable row level security;
alter table pantry_items enable row level security;
alter table saved_recipes enable row level security;

-- Temporär: alles erlaubt (bis Auth eingebaut ist)
create policy "public_all" on week_plans for all using (true) with check (true);
create policy "public_all" on freezer_items for all using (true) with check (true);
create policy "public_all" on pantry_items for all using (true) with check (true);
create policy "public_all" on saved_recipes for all using (true) with check (true);
