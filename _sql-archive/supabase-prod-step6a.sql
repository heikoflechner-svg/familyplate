-- ============================================================
-- FamilyPlate Production: Schritt 6A
-- Neue family_members-basierte Policies anlegen
--
-- Alte "family_access"-Policies bleiben UNANGETASTET.
-- Beide Policies laufen parallel (OR-Logik in Supabase RLS).
-- Ausführen in: dashboard.supabase.com → familyplate → SQL Editor
-- ============================================================

create policy "family_members_rls" on public.week_plans for all
  using  (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

create policy "family_members_rls" on public.family_profiles for all
  using  (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

create policy "family_members_rls" on public.freezer_items for all
  using  (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

create policy "family_members_rls" on public.pantry_items for all
  using  (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

create policy "family_members_rls" on public.saved_recipes for all
  using  (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

-- Zur Verifikation: alle aktiven Policies anzeigen
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('week_plans','family_profiles','freezer_items','pantry_items','saved_recipes')
order by tablename, policyname;
