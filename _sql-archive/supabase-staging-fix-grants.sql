-- ============================================================
-- FamilyPlate Staging: Grants + Schema-Cache Fix
-- Im Supabase SQL Editor des STAGING-Projekts ausführen
-- ============================================================

-- 1. Berechtigungen für family_members nachholen
--    (neue Tabellen per SQL Editor bekommen keine Auto-Grants)
grant select on public.family_members to anon;
grant select on public.family_members to authenticated;

-- 2. PostgREST Schema-Cache neu laden
--    (damit family_members in der REST API sichtbar wird)
notify pgrst, 'reload schema';

-- 3. Prüfen ob Flechner-Einträge in family_members existieren
select user_id, family_id, slot from family_members order by family_id, slot;

-- 4. Mueller-User-IDs prüfen (sollen M1/M2/M3 haben)
select u.email, fm.family_id, fm.slot
from auth.users u
left join family_members fm on fm.user_id = u.id
where u.email in ('anna@mueller.test', 'klaus@mueller.test', 'lena@mueller.test')
   or u.email in ('heiko@flechner-family.de', 'sabine@flechner-family.de', 'tim@flechner-family.de');

-- 5. Mueller-User E-Mail-Bestätigung erzwingen (falls nötig)
update auth.users
set email_confirmed_at = now(),
    confirmation_token = ''
where email in ('anna@mueller.test', 'klaus@mueller.test', 'lena@mueller.test')
  and email_confirmed_at is null;
