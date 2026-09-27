-- ============================================================
-- Migration 001 – Auth-System Grundstruktur
-- Ziel: familyplate-staging (NICHT Produktion)
-- Ausführen im Supabase SQL-Editor: NUR dieses File zuerst.
-- Anschließend 001b_flechner_seed.sql ausführen.
-- Anschließend 001c_switch_rls.sql ausführen.
-- ============================================================

-- ── 1. families ──────────────────────────────────────────────────────────────
create table if not exists families (
  id           text primary key,
  name         text not null,
  owner_id     uuid references auth.users(id) on delete set null,
  max_members  int  not null default 6,
  created_at   timestamptz not null default now()
);

-- ── 2. family_members ────────────────────────────────────────────────────────
create table if not exists family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    text not null references families(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member'
                 check (role in ('owner', 'member')),
  display_name text not null,
  kuerzel      text not null,   -- frei wählbar, z.B. 'PA', 'MA', 'TI'
  email        text not null,
  created_at   timestamptz not null default now(),
  unique (family_id, user_id),
  unique (family_id, kuerzel)   -- Kürzel eindeutig pro Familie
);

-- ── 3. family_invitations ────────────────────────────────────────────────────
create table if not exists family_invitations (
  id           uuid primary key default gen_random_uuid(),
  family_id    text not null references families(id) on delete cascade,
  email        text not null,
  token        uuid not null unique default gen_random_uuid(),
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'expired')),
  created_at   timestamptz not null default now()
);

-- ── 4. RLS für neue Tabellen ─────────────────────────────────────────────────
alter table families          enable row level security;
alter table family_members    enable row level security;
alter table family_invitations enable row level security;

-- families: lesen wenn Mitglied, schreiben nur Owner
create policy "families_select" on families for select
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = families.id
        and fm.user_id   = auth.uid()
    )
  );

create policy "families_update" on families for update
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- family_members: lesen wenn in derselben Familie; schreiben via service_role (API-Route)
create policy "family_members_select" on family_members for select
  using (
    family_id in (
      select fm2.family_id from family_members fm2
      where fm2.user_id = auth.uid()
    )
  );

-- Mitglied kann eigene Zeile ändern (display_name, kuerzel);
-- Owner kann alle Zeilen der eigenen Familie ändern
create policy "family_members_update" on family_members for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from family_members fm
      where fm.family_id = family_members.family_id
        and fm.user_id   = auth.uid()
        and fm.role      = 'owner'
    )
  );

-- Nur Owner kann Mitglieder entfernen
create policy "family_members_delete" on family_members for delete
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_members.family_id
        and fm.user_id   = auth.uid()
        and fm.role      = 'owner'
    )
  );

-- family_invitations: Mitglieder können Einladungen der eigenen Familie sehen;
-- eigene ausstehende Einladung ebenfalls sichtbar (für Accept-Flow)
create policy "invitations_select" on family_invitations for select
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_invitations.family_id
        and fm.user_id   = auth.uid()
    )
    or (
      email = (select email from auth.users where id = auth.uid())
      and status = 'pending'
    )
  );

-- Owner kann Einladungen widerrufen (status → 'expired' via UPDATE, oder DELETE)
create policy "invitations_update" on family_invitations for update
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = family_invitations.family_id
        and fm.user_id   = auth.uid()
        and fm.role      = 'owner'
    )
  );

-- Hinweis: INSERT auf family_members und family_invitations läuft ausschließlich
-- über serverseitige API-Routen mit service_role-Key (bypass RLS).
-- Kein client-seitiges INSERT nötig → keine INSERT-Policy erforderlich.
