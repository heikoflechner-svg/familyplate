# SQL-Archiv

Einmal-Skripte, bereits ausgeführt. NICHT erneut ausführen.

| Datei | Zweck | Datenbank |
|---|---|---|
| `supabase-prod-step6a.sql` | Neue RLS-Policies auf Basis von `family_members` anlegen | Produktion |
| `supabase-prod-step6b.sql` | Alte E-Mail-basierte `family_access`-Policies entfernen (nach Login-Test) | Produktion |
| `supabase-staging-fix-grants.sql` | Fehlende Grants auf `family_members` nachholen + Schema-Cache neu laden + Testnutzer-E-Mail-Bestätigung erzwingen | Staging |
