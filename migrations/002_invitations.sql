-- ============================================================
-- Migration 002 – Einladungssystem
-- Ziel: familyplate-staging (NICHT Produktion)
-- Ausführen im Supabase SQL-Editor.
-- ============================================================

-- ── 1. family_members: Rolle 'parent' ergänzen ──────────────────────────────
-- Constraint heißt "family_members_role_check" (auto-vergeben in 001).
-- 'child' kann später per analogem ALTER TABLE hinzugefügt werden.
alter table family_members
  drop constraint if exists family_members_role_check;
alter table family_members
  add constraint family_members_role_check
    check (role in ('owner', 'member', 'parent'));

-- ── 2. family_invitations: neue Spalten ─────────────────────────────────────
-- target_kuerzel: welcher Platzhalter (z.B. 'MA') wird eingeladen
-- invited_role:   Rolle nach Beitritt; 'child' bekommt keinen Einladungslink
alter table family_invitations
  add column if not exists target_kuerzel text,
  add column if not exists invited_role   text not null default 'member'
    check (invited_role in ('member', 'parent'));

-- ── 3. family_invitations: Status 'revoked' ergänzen ────────────────────────
-- Constraint heißt "family_invitations_status_check" (auto-vergeben in 001).
-- 'revoked' = bewusst zurückgezogen (vs. 'expired' = automatisch abgelaufen).
alter table family_invitations
  drop constraint if exists family_invitations_status_check;
alter table family_invitations
  add constraint family_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked'));

-- ── 4. RLS: Owner darf Einladungen löschen ──────────────────────────────────
-- PostgreSQL kennt kein "create policy if not exists" – daher DROP + CREATE.
-- Nicht selbstreferenziell: Policy liegt auf family_invitations,
-- der Subquery liest family_members (andere Tabelle, kein Zyklus).
drop policy if exists "invitations_delete" on family_invitations;
create policy "invitations_delete" on family_invitations for delete
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_invitations.family_id
        and fm.user_id   = auth.uid()
        and fm.role      = 'owner'
    )
  );
