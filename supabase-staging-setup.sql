-- FamilyPlate Staging-Datenbank Setup
-- Einmalig im Supabase SQL Editor des STAGING-Projekts ausführen
-- Erstellt alle Tabellen, RLS-Policies und einen leeren Startzustand

-- ─── Tabellen ────────────────────────────────────────────────────────────────

create table if not exists week_plans (
  id                uuid         default gen_random_uuid() primary key,
  family_id         text         not null default 'flechner',
  plan_data         jsonb        not null default '[]',
  meals_data        jsonb        not null default '{}',
  wishes            jsonb        not null default '[]',
  attendance        jsonb        not null default '[]',
  shopping_list     jsonb        not null default '[]',
  proposals         jsonb        not null default '[]',
  wochenchef        text                  default 'PA',
  plan_confirmed    boolean               default false,
  shopping_done     boolean               default false,
  shopping_day      text,
  shopping_persons  jsonb                 default '{}',
  week_start        text,
  next_week_start   text,
  next_week_data    jsonb,
  last_dishes       jsonb        not null default '[]',
  updated_at        timestamptz           default now()
);

create table if not exists family_profiles (
  id               uuid         default gen_random_uuid() primary key,
  family_id        text         not null unique default 'flechner',
  members          jsonb        not null default '[]',
  onboarding_done  boolean               default false,
  laeden           jsonb        not null default '[]',
  zutaten_laden    jsonb        not null default '{}',
  updated_at       timestamptz           default now()
);

create table if not exists freezer_items (
  id          uuid         default gen_random_uuid() primary key,
  family_id   text         not null default 'flechner',
  typ         text         not null default 'fertig',
  emoji       text                  default '🍲',
  name        text         not null,
  menge       text                  default '',
  datum       text                  default '',
  ampel       text                  default 'green',
  created_at  timestamptz           default now()
);

create table if not exists pantry_items (
  id          uuid         default gen_random_uuid() primary key,
  family_id   text         not null default 'flechner',
  emoji       text                  default '🗄️',
  name        text         not null,
  menge       text                  default '',
  ampel       text                  default 'green',
  created_at  timestamptz           default now()
);

create table if not exists saved_recipes (
  id          uuid         default gen_random_uuid() primary key,
  family_id   text         not null default 'flechner',
  name        text         not null,
  emoji       text                  default '🍽',
  created_at  timestamptz           default now()
);

-- ─── Startzustand ─────────────────────────────────────────────────────────────

insert into week_plans (family_id) values ('flechner');

insert into family_profiles (family_id, members, onboarding_done) values (
  'flechner',
  '[
    {"id":"PA","name":"Heiko","emoji":"👨","active":true,"allergien":[],"vorlieben":[]},
    {"id":"MA","name":"Sabine","emoji":"👩","active":true,"allergien":[],"vorlieben":[]},
    {"id":"TI","name":"Tim","emoji":"👦","active":true,"allergien":[],"vorlieben":[]}
  ]',
  true
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table week_plans      enable row level security;
alter table family_profiles enable row level security;
alter table freezer_items   enable row level security;
alter table pantry_items    enable row level security;
alter table saved_recipes   enable row level security;

create policy "family_access" on week_plans for all
  using ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ))
  with check ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ));

create policy "family_access" on family_profiles for all
  using ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ))
  with check ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ));

create policy "family_access" on freezer_items for all
  using ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ))
  with check ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ));

create policy "family_access" on pantry_items for all
  using ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ))
  with check ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ));

create policy "family_access" on saved_recipes for all
  using ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ))
  with check ((auth.jwt() ->> 'email') in (
    'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de'
  ));
