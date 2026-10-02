-- ============================================================
-- Migration 001b (v2) – Beide Test-Familien in neue Tabellen eintragen
-- Voraussetzung: 001_auth_schema.sql wurde erfolgreich ausgeführt.
-- Anschließend: 001c_switch_rls.sql ausführen.
-- ============================================================

-- ── Schritt 0: Diagnose – sind die Nutzer in auth.users sichtbar? ─────────────
select 'auth.users gefunden' as check, email
from auth.users
where email in (
  'heiko@flechner-family.de',
  'sabine@flechner-family.de',
  'tim@flechner-family.de',
  'anna@mueller.test',
  'klaus@mueller.test',
  'lena@mueller.test'
)
order by email;

-- ── Schritt 1: Familien anlegen ───────────────────────────────────────────────
insert into families (id, name, max_members)
values
  ('flechner', 'Familie Flechner', 6),
  ('mueller',  'Familie Müller',   6)
on conflict (id) do nothing;

-- Kontrolle
select id, name, max_members from families where id in ('flechner', 'mueller');

-- ── Schritt 2a: Flechner-Mitglieder ──────────────────────────────────────────
insert into family_members (family_id, user_id, role, display_name, kuerzel, email)
select
  'flechner',
  u.id,
  case u.email
    when 'heiko@flechner-family.de' then 'owner'
    else 'member'
  end,
  case u.email
    when 'heiko@flechner-family.de'  then 'Heiko'
    when 'sabine@flechner-family.de' then 'Sabine'
    when 'tim@flechner-family.de'    then 'Tim'
  end,
  case u.email
    when 'heiko@flechner-family.de'  then 'PA'
    when 'sabine@flechner-family.de' then 'MA'
    when 'tim@flechner-family.de'    then 'TI'
  end,
  u.email
from auth.users u
where u.email in (
  'heiko@flechner-family.de',
  'sabine@flechner-family.de',
  'tim@flechner-family.de'
)
on conflict (family_id, user_id) do nothing;

-- ── Schritt 2b: Müller-Mitglieder ────────────────────────────────────────────
-- Kürzels: AN / KL / LE  – Owner: Anna
-- Anpassen falls andere Kürzels gewünscht sind.
insert into family_members (family_id, user_id, role, display_name, kuerzel, email)
select
  'mueller',
  u.id,
  case u.email
    when 'anna@mueller.test' then 'owner'
    else 'member'
  end,
  case u.email
    when 'anna@mueller.test'  then 'Anna'
    when 'klaus@mueller.test' then 'Klaus'
    when 'lena@mueller.test'  then 'Lena'
  end,
  case u.email
    when 'anna@mueller.test'  then 'AN'
    when 'klaus@mueller.test' then 'KL'
    when 'lena@mueller.test'  then 'LE'
  end,
  u.email
from auth.users u
where u.email in (
  'anna@mueller.test',
  'klaus@mueller.test',
  'lena@mueller.test'
)
on conflict (family_id, user_id) do nothing;

-- ── Schritt 3: Owner-IDs in families eintragen ───────────────────────────────
update families
set owner_id = (
  select id from auth.users where email = 'heiko@flechner-family.de' limit 1
)
where id = 'flechner' and owner_id is null;

update families
set owner_id = (
  select id from auth.users where email = 'anna@mueller.test' limit 1
)
where id = 'mueller' and owner_id is null;

-- ── Abschlusskontrolle ───────────────────────────────────────────────────────
select
  fm.family_id,
  fm.role,
  fm.display_name,
  fm.kuerzel,
  fm.email
from family_members fm
order by fm.family_id, fm.role desc, fm.display_name;
