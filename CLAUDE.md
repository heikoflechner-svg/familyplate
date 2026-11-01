@AGENTS.md

## Kostenkontrolle

- **Vor jeder Änderung, die KI-Aufrufe (Anthropic API) betrifft oder neue hinzufügt:** im Plan angeben, welches Modell, wie oft der Aufruf ausgelöst wird und grobe Kosten pro Aufruf sowie pro Familie und Woche.
- **Keine automatischen oder wiederholten KI-Aufrufe ohne klaren Nutzen:** kein automatisches Neu-Erstellen im Hintergrund, keine Schleifen/Retries ohne explizite Obergrenze.
- **Günstigstes ausreichendes Modell wählen:** Haiku wo möglich, Sonnet nur wo nötig. Ergebnisse wiederverwenden statt neu erzeugen. Mengen-Umrechnungen und ähnliche Berechnungen immer ohne KI umsetzen.
- **Neue kostenpflichtige Dienste oder Tarif-Änderungen** nur nach ausdrücklicher Freigabe durch Heiko.

## Deployment-Regeln

- Alle Entwicklung und alle Commits laufen auf dem Branch **staging**.
- `git push` geht ausschließlich nach **origin/staging**.
- **NIEMALS** auf `main`, `master` oder `origin/main` pushen — weder direkt noch via `master:main` — ohne die ausdrückliche Freigabe mit dem genauen Wort **"FREIGABE PRODUKTION"** in der Nachricht.
- **Keine Force-Pushes** (`--force`, `--force-with-lease`) ohne ausdrückliche Zustimmung.
- Vercel-Projekte (`familyplate-app`, `familyplate-app-staging`) werden von mir nicht direkt angepasst.
