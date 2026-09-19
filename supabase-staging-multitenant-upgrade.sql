-- ============================================================
-- FamilyPlate Staging: Multi-Tenancy Upgrade
-- Im Supabase SQL Editor des STAGING-Projekts ausführen
-- ============================================================

-- ─── 1. family_members Tabelle ───────────────────────────────────────────────

create table if not exists family_members (
  user_id    uuid  primary key,
  family_id  text  not null,
  slot       text  not null
);

alter table family_members enable row level security;

-- Jeder User sieht nur seinen eigenen Eintrag
create policy "own_entry" on family_members for select
  using (user_id = auth.uid());

-- ─── 2. Alte RLS-Policies entfernen (email-basiert) ──────────────────────────

drop policy if exists "family_access" on week_plans;
drop policy if exists "family_access" on family_profiles;
drop policy if exists "family_access" on freezer_items;
drop policy if exists "family_access" on pantry_items;
drop policy if exists "family_access" on saved_recipes;

-- ─── 3. Neue RLS-Policies (family_members-basiert) ───────────────────────────

create policy "family_access" on week_plans for all
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "family_access" on family_profiles for all
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "family_access" on freezer_items for all
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "family_access" on pantry_items for all
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "family_access" on saved_recipes for all
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));

-- ─── 4. Flechner-Testnutzer verknüpfen ───────────────────────────────────────
-- Verknüpft die bereits angelegten Auth-User mit family_id='flechner'

insert into family_members (user_id, family_id, slot)
select id, 'flechner', case email
  when 'heiko@flechner-family.de'  then 'PA'
  when 'sabine@flechner-family.de' then 'MA'
  when 'tim@flechner-family.de'    then 'TI'
end
from auth.users
where email in ('heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de')
on conflict (user_id) do nothing;

-- ─── 5. Flechner members: allergien/vorlieben sichern ────────────────────────
-- Falls noch nicht passiert (Fix aus vorherigem Commit)

update family_profiles
set members = (
  select jsonb_agg(
    case
      when elem->>'allergien' is null
      then elem || '{"allergien":[],"vorlieben":[]}'::jsonb
      else elem
    end
  )
  from jsonb_array_elements(members) as elem
)
where family_id = 'flechner';

-- ─── 6. Mueller-Testfamilie anlegen ──────────────────────────────────────────

insert into family_profiles (family_id, members, onboarding_done, laeden) values (
  'mueller',
  '[
    {"id":"M1","name":"Anna","allergien":[],"vorlieben":[]},
    {"id":"M2","name":"Klaus","allergien":[],"vorlieben":[]},
    {"id":"M3","name":"Lena","allergien":["Laktose"],"vorlieben":["Vegetarisch","Pasta"]}
  ]',
  true,
  '["Aldi","Rewe","Kaufland","Sonstiges"]'
) on conflict (family_id) do nothing;

insert into week_plans (family_id, wochenchef) values ('mueller', 'M1')
on conflict do nothing;

-- ─── 7. Mueller-Nutzer anlegen ───────────────────────────────────────────────
-- ANLEITUNG: Lege im Supabase Dashboard unter Authentication > Users > Add User
-- folgende drei Nutzer an:
--   anna@mueller.test   / Passwort: Test1234!
--   klaus@mueller.test  / Passwort: Test1234!
--   lena@mueller.test   / Passwort: Test1234!
-- Dann diesen Block ausführen:

insert into family_members (user_id, family_id, slot)
select id, 'mueller', case email
  when 'anna@mueller.test'  then 'M1'
  when 'klaus@mueller.test' then 'M2'
  when 'lena@mueller.test'  then 'M3'
end
from auth.users
where email in ('anna@mueller.test', 'klaus@mueller.test', 'lena@mueller.test')
on conflict (user_id) do nothing;
