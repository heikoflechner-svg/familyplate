-- ============================================================
-- FamilyPlate Production: Schritt 6B
-- Alte E-Mail-basierte "family_access"-Policies entfernen
--
-- Voraussetzung: Schritt 6A (family_members_rls) UND Schritt 7
-- (Login-Test aller drei User) wurden erfolgreich abgeschlossen.
--
-- Ausführen in: dashboard.supabase.com → familyplate → SQL Editor
-- ============================================================

drop policy if exists "family_access" on public.week_plans;
drop policy if exists "family_access" on public.family_profiles;
drop policy if exists "family_access" on public.freezer_items;
drop policy if exists "family_access" on public.pantry_items;
drop policy if exists "family_access" on public.saved_recipes;

-- Verifikation: pro Tabelle darf nur noch "family_members_rls" übrig sein
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('week_plans','family_profiles','freezer_items','pantry_items','saved_recipes')
order by tablename, policyname;
