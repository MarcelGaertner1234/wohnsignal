# wohnsignal

Prototyp eines Wohnungsinserate-Portals für Baden-Württemberg — statisches HTML/CSS/JS, ohne Build-Schritt. Ein Demo-Projekt von TOMORROWWORKS.

**Alle Inserate sind fiktive Beispieldaten.** Formulare senden keine Daten, die Seiten stehen auf `noindex`. Beispielfotos: siehe `MEDIA-LICENSES.md` (Pexels-Lizenz).

**Live:** https://marcelgaertner1234.github.io/wohnsignal/

## Struktur

| Datei | Zweck |
|---|---|
| `index.html` | Startseite mit Suche, «Neu im Portal», Kennzahlen |
| `resultate.html` | Suchergebnisse mit Filterbar (Angebot, Ort/PLZ, Zimmer, Preis, Sortierung) |
| `inserat.html?id=ws-NNN` | Detailseite (Eckdaten, Kosten, Galerie, Anfrage-Vorschau) |
| `inserieren.html` | Inserat-Formular mit Live-Vorschau (Entwurfsmodus) |
| `merkliste.html` | Merkliste (localStorage, ohne Konto) |
| `impressum.html` / `datenschutz.html` / `kontakt.html` | Rechtsseiten + Projektvorstellung |
| `404.html` | Fehlerseite (GitHub Pages liefert sie automatisch aus) |
| `data.js` | 16 Beispielinserate (`window.WS_DATA`) |
| `app.js` | Gemeinsame Helfer (`window.WS`): Karten, Preise, SVG-Szenen, Favoriten |
| `verify.mjs` | Selbsttest, siehe unten |

## Lokal ansehen

`index.html` im Browser öffnen — läuft komplett per `file://`, kein Server nötig.

## Deploy-Prozess

1. Änderung machen.
2. **Cache-Busting:** Bei Änderungen an `styles.css`, `data.js` oder `app.js` die Versions-Query in **allen** HTML-Seiten bumpen (`styles.css?v=N`, `data.js?v=N`, `app.js?v=N`).
3. `node verify.mjs` — muss **0 FAIL** melden, sonst nicht deployen.
4. `git commit` + `git push origin main` — GitHub Pages baut automatisch (~1–3 Min).
5. **Live-Check:** Zielseiten unter der Live-URL mit Cache-Buster prüfen (`…/seite.html?cb=<timestamp>`), z. B. dass die neue Versions-Query ausgeliefert wird.

## verify.mjs

`node verify.mjs` prüft u. a.: alle Dateien vorhanden, `noindex` überall, **keine externen Ressourcen**, Header/Footer byte-identisch über alle Seiten, Datenschema der 16 Inserate (EUR, Landkreise, Pflichtfelder), keine CHF-/Altfeld-Reste, A11y-Basics (ein `h1`, Labels, keine nativen Dialoge), Vorschau-Modus-Texte der Formulare, Footer-Verdrahtung der Rechtsseiten, OG-/Social-Meta-Tags und WebP-Varianten der Fotos. Exit 0 = grün.

## Grundsätze

- **Ehrlichkeit:** Solange Beispieldaten drin sind, bleiben Kennzeichnungen («Beispieldaten», «Beispielfoto (Symbolbild)»), der Vorschau-Modus der Formulare und `noindex` bestehen.
- **Keine externen Ressourcen:** Fonts, Bilder, Skripte — alles lokal (verify erzwingt es).
- **de-DE:** deutsche Orthographie, EUR-Formate («1.500 €»).
