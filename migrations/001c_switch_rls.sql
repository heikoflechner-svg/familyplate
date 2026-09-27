-- ============================================================
-- Migration 001c – Bestehende Tabellen auf family_members-RLS umstellen
-- Voraussetzung: 001b_flechner_seed.sql wurde ausgeführt UND
--   "SELECT count(*) FROM family_members WHERE family_id='flechner'"
--   zeigt mindestens 1 Zeile.
-- ERST ausführen wenn 001b erfolgreich war!
-- ============================================================

-- Hilfsfunktion: RLS-Check als inline Subquery
-- Für jede Tabelle: DROP alte email-whitelist policy, CREATE neue family_members-policy.

-- ── week_plans ───────────────────────────────────────────────────────────────
drop policy if exists "family_access" on week_plans;

create policy "family_access" on week_plans for all
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = week_plans.family_id
        and fm.user_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = week_plans.family_id
        and fm.user_id   = auth.uid()
    )
  );

-- ── freezer_items ────────────────────────────────────────────────────────────
drop policy if exists "family_access" on freezer_items;

create policy "family_access" on freezer_items for all
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = freezer_items.family_id
        and fm.user_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = freezer_items.family_id
        and fm.user_id   = auth.uid()
    )
  );

-- ── pantry_items ─────────────────────────────────────────────────────────────
drop policy if exists "family_access" on pantry_items;

create policy "family_access" on pantry_items for all
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = pantry_items.family_id
        and fm.user_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = pantry_items.family_id
        and fm.user_id   = auth.uid()
    )
  );

-- ── saved_recipes ─────────────────────────────────────────────────────────────
drop policy if exists "family_access" on saved_recipes;

create policy "family_access" on saved_recipes for all
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = saved_recipes.family_id
        and fm.user_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = saved_recipes.family_id
        and fm.user_id   = auth.uid()
    )
  );

-- ── family_profiles ──────────────────────────────────────────────────────────
drop policy if exists "family_access" on family_profiles;

create policy "family_access" on family_profiles for all
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_profiles.family_id
        and fm.user_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_profiles.family_id
        and fm.user_id   = auth.uid()
    )
  );

-- ── Abschlusskontrolle ───────────────────────────────────────────────────────
-- Alle aktiven Policies anzeigen:
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
