-- Phase 8: RLS-Update für alle 5 Tabellen
-- Alte "public_all"-Policies droppen, neue email-basierte Policies setzen
-- Einmalig im Supabase SQL Editor ausführen

-- week_plans
drop policy "public_all" on week_plans;
create policy "family_access" on week_plans for all
  using (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  )
  with check (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  );

-- freezer_items
drop policy "public_all" on freezer_items;
create policy "family_access" on freezer_items for all
  using (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  )
  with check (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  );

-- pantry_items
drop policy "public_all" on pantry_items;
create policy "family_access" on pantry_items for all
  using (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  )
  with check (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  );

-- saved_recipes
drop policy "public_all" on saved_recipes;
create policy "family_access" on saved_recipes for all
  using (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  )
  with check (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  );

-- family_profiles
drop policy "public_all" on family_profiles;
create policy "family_access" on family_profiles for all
  using (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  )
  with check (
    (auth.jwt() ->> 'email') in (
      'heiko@flechner-family.de',
      'sabine@flechner-family.de',
      'tim@flechner-family.de'
    )
  );
