-- ============================================================
-- FamilyPlate Staging: Diagnose + Komplett-Fix
-- Im Supabase SQL Editor des STAGING-Projekts ausführen
-- Zeigt den aktuellen Status und behebt alle bekannten Probleme
-- ============================================================

-- ── Schritt 1: Grants nachholen ─────────────────────────────
grant select  on public.family_members to anon;
grant select  on public.family_members to authenticated;
grant all     on public.family_members to service_role;

-- ── Schritt 2: Schema-Cache neu laden ───────────────────────
notify pgrst, 'reload schema';

-- ── Schritt 3: Diagnose — Tabelle + Einträge ────────────────
select 'family_members Einträge:' as info;
select user_id, family_id, slot from public.family_members order by family_id, slot;

-- ── Schritt 4: Diagnose — Auth-User + Verknüpfung ───────────
select 'Auth-User Status:' as info;
select
  u.email,
  u.email_confirmed_at is not null as bestätigt,
  fm.family_id,
  fm.slot
from auth.users u
left join public.family_members fm on fm.user_id = u.id
where u.email in (
  'heiko@flechner-family.de',
  'sabine@flechner-family.de',
  'tim@flechner-family.de',
  'anna@mueller.test',
  'klaus@mueller.test',
  'lena@mueller.test'
)
order by u.email;

-- ── Schritt 5: E-Mail-Bestätigung erzwingen ─────────────────
update auth.users
set
  email_confirmed_at = now(),
  confirmation_token = '',
  recovery_token     = '',
  email_change_token_new = ''
where email in ('anna@mueller.test', 'klaus@mueller.test', 'lena@mueller.test');

-- ── Schritt 6: Prüfen ob Mueller family_members existieren ──
-- Falls family_members für Mueller fehlen (weil Block 7 noch nicht lief)
-- diese hier einfügen:
insert into public.family_members (user_id, family_id, slot)
select id, 'mueller', case email
  when 'anna@mueller.test'  then 'M1'
  when 'klaus@mueller.test' then 'M2'
  when 'lena@mueller.test'  then 'M3'
end
from auth.users
where email in ('anna@mueller.test', 'klaus@mueller.test', 'lena@mueller.test')
on conflict (user_id) do nothing;

-- ── Schritt 7: Endergebnis anzeigen ─────────────────────────
select 'Ergebnis nach Fix:' as info;
select u.email, u.email_confirmed_at is not null as email_ok, fm.family_id, fm.slot
from auth.users u
left join public.family_members fm on fm.user_id = u.id
where u.email in (
  'heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de',
  'anna@mueller.test', 'klaus@mueller.test', 'lena@mueller.test'
)
order by fm.family_id, fm.slot;
