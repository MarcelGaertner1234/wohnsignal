# wohnsignal — Backend (Phase 2)

Supabase (Postgres + Auth + Storage, EU) hinter dem statischen Frontend auf GitHub Pages.
Diese Dateien sind Infrastruktur-Code — **Keys und Secrets gehören NIE in dieses Repo.**

## Architektur

- **Frontend:** unverändert statisch (GitHub Pages, später wohnsignal.de). Ohne konfigurierte
  Backend-Keys läuft alles im bisherigen Vorschau-Modus weiter (Feature-Flag).
- **Datenbank:** `schema.sql` — Tabellen `profile`, `inserate` (mit Moderations-Gate:
  Inserenten reichen ein, nur Admin schaltet «aktiv»), `anfragen` (nur via Edge Function
  beschreibbar). Row Level Security überall aktiv.
- **Auth:** Supabase Auth mit **Magic Link** (E-Mail-Login ohne Passwort — die Demo-Regel
  «kein Passwortfeld» gilt auch produktiv).
- **Anfragen:** Edge Function `anfrage` — Validierung, Honeypot, Rate-Limit (5/Stunde je
  IP-Hash, gepfeffert = datensparsam), Insert + Mail via Resend (Reply-To = Interessent).

## Einmaliges Setup (Marcel, ~15 Minuten)

1. **Supabase-Projekt anlegen:** [supabase.com/dashboard](https://supabase.com/dashboard) →
   ⚠️ **zuerst eine FREE-Organisation erstellen** (Link «Create a free organization» im
   New-Project-Formular) — in einer Pro-Org kostet das Projekt $10/Monat! Dann:
   New Project in der Free-Org → Name `wohnsignal`, GitHub-Feld leer, Region **EU
   (Frankfurt)**, Passwort generieren (Passwortmanager; wird im Alltag nicht gebraucht),
   Security: Data API **an**, «Automatically expose new tables» **aus**,
   «Enable automatic RLS» **an**. Additional costs muss **$0** zeigen.
   Hinweis: Free-Projekte pausieren nach ~1 Woche Inaktivität (per Klick weckbar).
2. **Schema einspielen:** Dashboard → SQL Editor → Inhalt von `schema.sql` einfügen → Run.
3. **Auth konfigurieren:** Authentication → Sign In / Up → nur **Email** aktivieren,
   Passwort-Login AUS, Magic Link AN. Unter URL Configuration die Site-URL
   `https://marcelgaertner1234.github.io/wohnsignal/` eintragen (später wohnsignal.de).
4. **Resend-Konto anlegen:** [resend.com](https://resend.com) (Free: 100 Mails/Tag) →
   API Key erstellen. Solange wohnsignal.de nicht verifiziert ist, sendet Resend nur an
   die eigene Registrierungs-Adresse (Absender `onboarding@resend.dev`) — für Tests genug.
5. **Edge Function deployen:** Dashboard → Edge Functions → Deploy new function →
   Name `anfrage`, Inhalt aus `edge-functions/anfrage/index.ts`. Danach unter
   Edge Functions → Secrets setzen:
   - `RESEND_API_KEY` — aus Schritt 4
   - `PORTAL_EMPFANG` — Postfach, das Anfragen erhält
   - `ABSENDER` — `onboarding@resend.dev` (später `anfragen@wohnsignal.de`)
   - `ERLAUBTE_ORIGINS` — `https://marcelgaertner1234.github.io`
   - `IP_PEPPER` — beliebiger langer Zufallsstring
6. **An Claude übergeben:** Projekt-URL (`https://<ref>.supabase.co`) und den
   **anon/public key** (Settings → API Keys). Beide sind für den Browser bestimmt und
   dürfen im Frontend stehen. **Den service_role key niemals weitergeben oder committen.**
7. **Admin werden:** Nach dem ersten eigenen Login das SQL am Ende von `schema.sql`
   ausführen (setzt deine `profile.rolle` auf `admin`).

## Danach (Claude)

P2-1: Frontend-Verdrahtung des Anfrage-Formulars (Feature-Flag `konfig.js`), dann
P2-2 Login/Konto, P2-3 Inserieren + Moderation, P2-4 Bild-Upload. Die verify-Regel
«keine externen Ressourcen» wird dabei bewusst auf eine Allowlist (nur der eigene
Supabase-Host) umgestellt und dokumentiert.

## Kosten

Supabase Free (500 MB DB, 50k monatliche Auth-Nutzer, 1 GB Storage) + Resend Free
(100 Mails/Tag) + GitHub Pages = **0 € laufend**, zzgl. Domains (~40–50 CHF/Jahr).
Upgrades nur bei echtem Wachstum und nach explizitem Ok.
