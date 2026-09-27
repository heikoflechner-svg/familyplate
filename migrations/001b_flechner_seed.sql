-- ============================================================
-- Migration 001b – Flechner-Familie in neue Tabellen eintragen
-- Voraussetzung: 001_auth_schema.sql wurde ausgeführt.
-- Anschließend: 001c_switch_rls.sql ausführen.
--
-- Sucht die drei Nutzer automatisch per E-Mail in auth.users.
-- Falls ein Nutzer in der Staging-DB nicht existiert, wird nur
-- die vorhandene Teilmenge eingefügt (kein Fehler).
-- ============================================================

-- Schritt 1: Familie anlegen (idempotent)
insert into families (id, name, max_members)
values ('flechner', 'Familie Flechner', 6)
on conflict (id) do nothing;

-- Schritt 2: Mitglieder eintragen (lookup via auth.users.email)
insert into family_members (family_id, user_id, role, display_name, kuerzel, email)
select
  'flechner'                                                as family_id,
  u.id                                                      as user_id,
  case u.email
    when 'heiko@flechner-family.de' then 'owner'
    else 'member'
  end                                                       as role,
  case u.email
    when 'heiko@flechner-family.de' then 'Heiko'
    when 'sabine@flechner-family.de' then 'Sabine'
    when 'tim@flechner-family.de'   then 'Tim'
  end                                                       as display_name,
  case u.email
    when 'heiko@flechner-family.de' then 'PA'
    when 'sabine@flechner-family.de' then 'MA'
    when 'tim@flechner-family.de'   then 'TI'
  end                                                       as kuerzel,
  u.email
from auth.users u
where u.email in (
  'heiko@flechner-family.de',
  'sabine@flechner-family.de',
  'tim@flechner-family.de'
)
on conflict (family_id, user_id) do nothing;

-- Schritt 3: Owner in families.owner_id eintragen
update families
set owner_id = (
  select u.id from auth.users u
  where u.email = 'heiko@flechner-family.de'
  limit 1
)
where id = 'flechner'
  and owner_id is null;

-- Kontrolle: Anzahl eingefügter Mitglieder anzeigen
select count(*) as flechner_mitglieder
from family_members
where family_id = 'flechner';
