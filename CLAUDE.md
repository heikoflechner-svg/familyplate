@AGENTS.md

## Deployment-Regeln

- Alle Entwicklung und alle Commits laufen auf dem Branch **staging**.
- `git push` geht ausschließlich nach **origin/staging**.
- **NIEMALS** auf `main`, `master` oder `origin/main` pushen — weder direkt noch via `master:main` — ohne die ausdrückliche Freigabe mit dem genauen Wort **"FREIGABE PRODUKTION"** in der Nachricht.
- **Keine Force-Pushes** (`--force`, `--force-with-lease`) ohne ausdrückliche Zustimmung.
- Vercel-Projekte (`familyplate-app`, `familyplate-app-staging`) werden von mir nicht direkt angepasst.
