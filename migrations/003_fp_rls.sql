-- Etappe 3b: family_profiles RLS verfeinern
-- Die bisherige "family_access"-Policy erlaubt allen Familienmitgliedern zu schreiben.
-- Nach dieser Migration gilt:
--   SELECT  → alle Familienmitglieder (unverändert)
--   INSERT  → nur owner/admin (Sicherheitsnetz; Schreiben erfolgt über /api/profile/save)
--   UPDATE  → nur owner/admin (Sicherheitsnetz; Schreiben erfolgt über /api/profile/save)
--   DELETE  → keine Policy → kein direktes Löschen per Anon-Key möglich
--             (Familie löschen läuft über eigene Route mit service_role)
--
-- /api/profile/save verwendet service_role und erzwingt feingranulare Rechte im Code:
--   owner/admin  → alle Felder, alle Mitglieder
--   parent       → eigenes Profil + Kinder (istKind); Läden; keine Personen hinzufügen/entfernen
--   member       → nur eigenes Profil; keine Läden; keine Personen hinzufügen/entfernen

drop policy if exists "family_access" on family_profiles;

-- Lesen: alle Familienmitglieder
create policy "fp_select" on family_profiles
  for select
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_profiles.family_id
        and fm.user_id   = auth.uid()
    )
  );

-- Einfügen: nur owner/admin (Sicherheitsnetz)
create policy "fp_insert" on family_profiles
  for insert
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_profiles.family_id
        and fm.user_id   = auth.uid()
        and fm.role in ('owner', 'admin')
    )
  );

-- Aktualisieren: nur owner/admin (Sicherheitsnetz)
create policy "fp_update" on family_profiles
  for update
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_profiles.family_id
        and fm.user_id   = auth.uid()
        and fm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_profiles.family_id
        and fm.user_id   = auth.uid()
        and fm.role in ('owner', 'admin')
    )
  );
