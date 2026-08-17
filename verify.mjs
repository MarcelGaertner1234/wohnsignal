#!/usr/bin/env node
/**
 * wohnsignal — verify.mjs
 * Reine Node-Checks ohne Browser (Konvention der alten Projekte).
 * Aufruf:  node verify.mjs
 * Exit 0 = alles gruen, Exit 1 = mindestens ein Check rot.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = dirname(fileURLToPath(import.meta.url));

const HTML_FILES = ['index.html', 'resultate.html', 'inserat.html', 'inserieren.html', 'merkliste.html',
  'impressum.html', 'datenschutz.html', 'kontakt.html', '404.html', 'mein-bereich.html',
  'ratgeber.html', 'ratgeber-besichtigung.html', 'ratgeber-kaufnebenkosten.html', 'ratgeber-umzug.html'];
const ALL_FILES = [...HTML_FILES, 'styles.css', 'data.js', 'app.js'];

let pass = 0;
let fail = 0;
const failed = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    failed.push(name);
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function read(f) {
  return readFileSync(join(DIR, f), 'utf8');
}

/* <script>-Inhalte entfernen (fuer Struktur-Checks am statischen Markup) */
function stripScripts(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, '<script></script>');
}

/* ------------------------------------------------------------------ */
/* 1. alle 8 dateien existieren und sind nicht leer                    */
/* ------------------------------------------------------------------ */
for (const f of ALL_FILES) {
  const p = join(DIR, f);
  const ok = existsSync(p) && statSync(p).size > 0;
  check(`1. datei vorhanden & nicht leer: ${f}`, ok);
}

const src = {};
for (const f of ALL_FILES) {
  try { src[f] = read(f); } catch { src[f] = ''; }
}

/* ------------------------------------------------------------------ */
/* 2. noindex-meta auf jeder html-seite                                */
/* ------------------------------------------------------------------ */
for (const f of HTML_FILES) {
  check(
    `2. noindex-meta: ${f}`,
    /<meta\s+name="robots"\s+content="noindex"\s*\/?>/i.test(src[f])
  );
}

/* ------------------------------------------------------------------ */
/* 3. keine externen ressourcen in attribut-/css-/fetch-kontexten      */
/* ------------------------------------------------------------------ */
const EXTERN_PATTERNS = [
  [/\b(?:src|href|action|srcset|poster|data)\s*=\s*["'][^"']*https?:\/\//i, 'http(s) in html-attribut'],
  [/url\(\s*["']?\s*https?:\/\//i, 'http(s) in css url()'],
  [/@import\b[^;{]*https?:\/\//i, 'http(s) in @import'],
  [/fetch\s*\(\s*["'`][^"'`]*https?:\/\//i, 'http(s) in fetch()'],
  [/\bnew\s+XMLHttpRequest\b/i, 'XMLHttpRequest'],
  [/\bnew\s+WebSocket\s*\(/i, 'WebSocket']
];
for (const f of ALL_FILES) {
  let hit = null;
  for (const [re, label] of EXTERN_PATTERNS) {
    if (re.test(src[f])) { hit = label; break; }
  }
  check(`3. keine externen ressourcen: ${f}`, hit === null, hit || '');
}

/* ------------------------------------------------------------------ */
/* 4. header-/footer-block byte-identisch (aria-current normalisiert)  */
/* ------------------------------------------------------------------ */
function block(html, start, end) {
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1 || j < i) { return null; }
  return html.slice(i + start.length, j);
}
function normAria(s) {
  return s.replace(/\s+aria-current="page"/g, '');
}
for (const [label, a, b] of [
  ['header', '<!-- ws:header -->', '<!-- /ws:header -->'],
  ['footer', '<!-- ws:footer -->', '<!-- /ws:footer -->']
]) {
  const blocks = HTML_FILES.map((f) => {
    const raw = block(src[f], a, b);
    return { f, raw, norm: raw === null ? null : normAria(raw) };
  });
  const missing = blocks.filter((x) => x.raw === null).map((x) => x.f);
  if (missing.length) {
    check(`4. ${label}-block vorhanden`, false, `marker fehlen in: ${missing.join(', ')}`);
    continue;
  }
  /* mehrheitsversion bestimmen und abweichler benennen */
  const counts = new Map();
  for (const x of blocks) { counts.set(x.norm, (counts.get(x.norm) || 0) + 1); }
  let kanon = null; let best = -1;
  for (const [k, n] of counts) { if (n > best) { best = n; kanon = k; } }
  const abweichler = blocks.filter((x) => x.norm !== kanon).map((x) => x.f);
  check(
    `4. ${label}-block identisch auf allen 5 seiten (aria-current normalisiert)`,
    abweichler.length === 0,
    abweichler.length ? `abweichend von mehrheitsversion: ${abweichler.join(', ')}` : ''
  );
}

/* ------------------------------------------------------------------ */
/* 5. data.js: syntax, 16 inserate, 11 miete / 5 kauf, pflichtfelder,  */
/*    de-DE-markt: kein "CHF" und kein kanton-/preisChf-rest           */
/* ------------------------------------------------------------------ */
const dataCheck = spawnSync(process.execPath, ['--check', join(DIR, 'data.js')], { encoding: 'utf8' });
check('5. data.js: node --check ok', dataCheck.status === 0, (dataCheck.stderr || '').trim().split('\n')[0]);

let listings = null;
try {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src['data.js'], sandbox, { filename: 'data.js' });
  listings = sandbox.window.WS_DATA && sandbox.window.WS_DATA.listings;
} catch (e) {
  listings = null;
}
check('5. data.js: WS_DATA.listings auswertbar', Array.isArray(listings));

if (Array.isArray(listings)) {
  check('5. data.js: genau 16 inserate', listings.length === 16, `gefunden: ${listings.length}`);

  const sollIds = [];
  for (let i = 1; i <= 16; i++) { sollIds.push('ws-' + String(i).padStart(3, '0')); }
  const istIds = listings.map((l) => l && l.id);
  const idsOk = sollIds.length === istIds.length && sollIds.every((id) => istIds.includes(id));
  check('5. data.js: ids ws-001..ws-016 vollstaendig', idsOk,
    idsOk ? '' : `fehlend: ${sollIds.filter((id) => !istIds.includes(id)).join(', ') || '-'}; fremd: ${istIds.filter((id) => !sollIds.includes(id)).join(', ') || '-'}`);

  const miete = listings.filter((l) => l.angebot === 'miete').length;
  const kauf = listings.filter((l) => l.angebot === 'kauf').length;
  check('5. data.js: 11 miete / 5 kauf', miete === 11 && kauf === 5, `ist: ${miete} miete / ${kauf} kauf`);

  const PFLICHT = ['id', 'titel', 'typ', 'angebot', 'ort', 'kreis', 'plz', 'strasse', 'preisEur',
    'zimmer', 'flaecheM2', 'etage', 'verfuegbarAb', 'merkmale', 'beschreibung', 'sceneHint', 'neu'];
  const defekte = [];
  for (const l of listings) {
    for (const feld of PFLICHT) {
      const v = l[feld];
      const leer = v === undefined || v === null
        || (typeof v === 'string' && v.trim() === '')
        || (Array.isArray(v) && v.length === 0);
      if (feld === 'neu') {
        if (typeof v !== 'boolean') { defekte.push(`${l.id || '?'}: ${feld}`); }
      } else if (leer) {
        defekte.push(`${l.id || '?'}: ${feld}`);
      }
    }
  }
  check('5. data.js: alle pflichtfelder gesetzt', defekte.length === 0, defekte.slice(0, 6).join(', '));
}

/* markt = DE/BW seit 17.08.2026: waehrung ist EUR, felder heissen kreis/preisEur */
for (const f of ALL_FILES) {
  check(`5. kein "CHF" (markt = DE/EUR): ${f}`, !src[f].includes('CHF'));
}
for (const f of ALL_FILES) {
  const alt = ['preisChf', 'formatChf'].find((t) => src[f].includes(t));
  check(`5. keine alt-feldnamen (preisChf/formatChf): ${f}`, !alt, alt || '');
}

/* ------------------------------------------------------------------ */
/* 6. app.js: syntax + kernfunktionen                                  */
/* ------------------------------------------------------------------ */
const appCheck = spawnSync(process.execPath, ['--check', join(DIR, 'app.js')], { encoding: 'utf8' });
check('6. app.js: node --check ok', appCheck.status === 0, (appCheck.stderr || '').trim().split('\n')[0]);

for (const fn of ['formatEur', 'formatPreis', 'renderScene', 'renderCard', 'getFavs', 'toggleFav']) {
  check(`6. app.js: function ${fn} definiert`, new RegExp(`function\\s+${fn}\\s*\\(`).test(src['app.js']));
}

/* ------------------------------------------------------------------ */
/* 7. inserat.html: badge "beispielinserat"; footer: "beispieldaten"   */
/* ------------------------------------------------------------------ */
check('7. inserat.html: badge-text "beispielinserat"', src['inserat.html'].includes('beispielinserat'));
{
  const fb = block(src['inserat.html'], '<!-- ws:footer -->', '<!-- /ws:footer -->') || '';
  check('7. footer enthaelt "beispieldaten"', fb.includes('beispieldaten'));
}

/* ------------------------------------------------------------------ */
/* 8. vorschau-hinweis auf beiden formularseiten                       */
/* ------------------------------------------------------------------ */
const VORSCHAU_TEXT = 'vorschau geprüft — es wurden keine daten versendet.';
for (const f of ['inserat.html', 'inserieren.html']) {
  check(`8. "${VORSCHAU_TEXT}" in ${f}`, src[f].includes(VORSCHAU_TEXT));
}

/* ------------------------------------------------------------------ */
/* 9. styles.css: kein backdrop-filter; prefers-reduced-motion da      */
/* ------------------------------------------------------------------ */
check('9. styles.css: kein backdrop-filter', !/backdrop-filter/i.test(src['styles.css']));
check('9. styles.css: prefers-reduced-motion media-query vorhanden',
  /@media[^{]*prefers-reduced-motion/i.test(src['styles.css']));

/* ------------------------------------------------------------------ */
/* 10. struktur & a11y je seite (nur statisches markup, ohne scripts)  */
/* ------------------------------------------------------------------ */
for (const f of HTML_FILES) {
  const html = stripScripts(src[f]);

  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  check(`10. ${f}: genau ein <h1>`, h1s === 1, `gefunden: ${h1s}`);
  check(`10. ${f}: <html lang="de-DE">`, /<html\s+lang="de-DE">/.test(html));
  check(`10. ${f}: <main> vorhanden`, /<main[\s>]/.test(html));

  /* label-zuordnung: for/id, umschliessendes <label> oder aria-label */
  const labelFor = new Set();
  for (const m of html.matchAll(/<label\b[^>]*\bfor\s*=\s*"([^"]+)"/gi)) { labelFor.add(m[1]); }

  const felder = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)];
  const ohneLabel = [];
  for (const m of felder) {
    const tag = m[0];
    if (/type\s*=\s*"hidden"/i.test(tag)) { continue; }
    if (/aria-label(?:ledby)?\s*=\s*"/i.test(tag)) { continue; }
    const idm = tag.match(/\bid\s*=\s*"([^"]+)"/i);
    if (idm && labelFor.has(idm[1])) { continue; }
    /* umschliessend: letztes <label vor dem feld noch offen? */
    const vorher = html.slice(0, m.index);
    const lastOpen = vorher.lastIndexOf('<label');
    const lastClose = vorher.lastIndexOf('</label');
    if (lastOpen > lastClose && html.indexOf('</label', m.index) > -1) { continue; }
    ohneLabel.push(idm ? `#${idm[1]}` : tag.slice(0, 40));
  }
  check(`10. ${f}: alle formularfelder mit label/aria-label`, ohneLabel.length === 0, ohneLabel.join(', '));
}

/* ------------------------------------------------------------------ */
/* 11. keine nativen dialoge (window.confirm/alert/prompt-AUFRUFE)     */
/* ------------------------------------------------------------------ */
for (const f of ALL_FILES) {
  const hit = src[f].match(/\b(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/);
  check(`11. kein alert/confirm/prompt-aufruf: ${f}`, hit === null, hit ? hit[0] : '');
}

/* ------------------------------------------------------------------ */
/* 12. resultate.html verlinkt inserat.html?id= (via renderCard)       */
/* ------------------------------------------------------------------ */
check('12. app.js: renderCard baut href "inserat.html?id="', src['app.js'].includes("'inserat.html?id='"));
check('12. resultate.html: nutzt WS.renderCard fuer die karten', /WS\.renderCard\s*\(/.test(src['resultate.html']));

/* ------------------------------------------------------------------ */
/* 13. (zusatz) alle referenzierten lokalen dateien existieren         */
/* ------------------------------------------------------------------ */
for (const f of ALL_FILES) {
  const refs = new Set();
  if (f.endsWith('.css')) {
    /* css: nur url() und @import sind echte referenzen */
    for (const m of src[f].matchAll(/(?:url\(\s*["']?|@import\s+["'])([a-z0-9._\-]+\.(?:html|css|js))/gi)) {
      refs.add(m[1]);
    }
  } else {
    /* html + js: nur zitierte referenzen (attribute und string-literale) */
    for (const m of src[f].matchAll(/["'`]([a-z0-9._\-]+\.(?:html|css|js))(?:[?#][^"'`]*)?["'`]/gi)) {
      refs.add(m[1]);
    }
  }
  const tote = [...refs].filter((r) => !existsSync(join(DIR, r)));
  check(`13. keine toten datei-referenzen: ${f}`, tote.length === 0, tote.join(', '));
}

/* --- 14. beispielfotos: jedes inserat hat ein lokales, dokumentiertes foto --- */
if (Array.isArray(listings)) {
  const ohneFoto = listings.filter((l) => !l.foto || !/^assets\/[a-z0-9\-]+\.jpg$/.test(l.foto));
  check('14. data.js: alle inserate mit lokalem foto-feld (assets/*.jpg)', ohneFoto.length === 0,
    ohneFoto.map((l) => l.id).join(', '));
  const fotoFehlt = listings.filter((l) => l.foto && !existsSync(join(DIR, l.foto)));
  check('14. alle foto-dateien vorhanden', fotoFehlt.length === 0, fotoFehlt.map((l) => l.foto).join(', '));
}
check('14. app.js: renderCard nutzt listing.foto', src['app.js'].includes('listing.foto'));
check('14. inserat.html: kopf nutzt inserat.foto mit svg-fallback', src['inserat.html'].includes('inserat.foto'));
check('14. inserat.html: beispielfoto-kennzeichnung vorhanden',
  src['inserat.html'].includes('Beispielfoto (Symbolbild)'));
check('14. ticker behauptet nicht mehr "Visualisierungen statt Fotografien"',
  !src['inserat.html'].includes('Visualisierungen statt Fotografien'));
try {
  const lizenz = readFileSync(join(DIR, 'MEDIA-LICENSES.md'), 'utf8');
  const undok = Array.isArray(listings)
    ? listings.filter((l) => l.foto && !lizenz.includes(l.foto.replace('assets/', '')))
    : [];
  check('14. MEDIA-LICENSES.md dokumentiert jedes foto', undok.length === 0,
    undok.map((l) => l.foto).join(', '));
} catch (e) {
  check('14. MEDIA-LICENSES.md vorhanden', false, String(e.message || e));
}

/* --- 16. rechtsseiten & footer-verdrahtung (paket 2, 17.08.2026) --- */
{
  for (const f of HTML_FILES) {
    const fb = block(src[f], '<!-- ws:footer -->', '<!-- /ws:footer -->') || '';
    check(`16. footer ohne tote "#"-links: ${f}`, !fb.includes('href="#"'));
    const fehlend = ['impressum.html', 'datenschutz.html', 'kontakt.html'].filter((z) => !fb.includes(`href="${z}"`));
    check(`16. footer verlinkt rechtsseiten: ${f}`, fehlend.length === 0, fehlend.join(', '));
  }
  check('16. footer nennt TOMORROWWORKS (demo-branding)',
    (block(src['index.html'], '<!-- ws:footer -->', '<!-- /ws:footer -->') || '').includes('TOMORROWWORKS'));
  check('16. impressum.html: DDG-bezug vorhanden', src['impressum.html'].includes('§ 5'));
  check('16. impressum.html: entwurfs-hinweis (juristische pruefung)',
    src['impressum.html'].includes('juristisch geprüft'));
  check('16. datenschutz.html: localStorage transparent erklaert',
    src['datenschutz.html'].includes('localStorage'));
  check('16. datenschutz.html: entwurfs-hinweis (juristische pruefung)',
    src['datenschutz.html'].includes('juristisch geprüft'));
  check('16. kontakt.html: TOMORROWWORKS-bezug', src['kontakt.html'].includes('TOMORROWWORKS'));
  /* solange marcels angaben fehlen, MUESSEN die platzhalter sichtbar sein —
     sobald echte angaben drin sind, diesen check invertieren/entfernen */
  check('16. impressum.html: platzhalter ODER echte angaben ohne web.de',
    src['impressum.html'].includes('[INHABER') || !src['impressum.html'].includes('web.de'));
}

/* --- 17. og-/social-meta + icons (paket 3, 17.08.2026) --- */
{
  const BASE = 'https://marcelgaertner1234.github.io/wohnsignal/';
  for (const f of HTML_FILES) {
    check(`17. ${f}: og:title vorhanden`, /property="og:title"/.test(src[f]));
    check(`17. ${f}: og:image absolut auf assets/og-image.jpg`,
      src[f].includes(`content="${BASE}assets/og-image.jpg"`));
    check(`17. ${f}: og:url zeigt auf die eigene seite`, src[f].includes(`content="${BASE}${f}"`));
    check(`17. ${f}: twitter:card + meta-description`,
      /name="twitter:card"/.test(src[f]) && /name="description"/.test(src[f]));
    check(`17. ${f}: png-favicon verlinkt`, src[f].includes('assets/favicon.png'));
  }
  check('17. assets/og-image.jpg vorhanden (1200x630)', existsSync(join(DIR, 'assets/og-image.jpg')));
  check('17. assets/favicon.png vorhanden', existsSync(join(DIR, 'assets/favicon.png')));
}

/* --- 19. filter-ausbau + vergleichsansicht (paket B, 17.08.2026) --- */
check('19. resultate.html: flaeche-filter vorhanden', src['resultate.html'].includes('id="f-flaeche"'));
check('19. resultate.html: merkmal-chips vorhanden (5)',
  (src['resultate.html'].match(/data-merkmal="/g) || []).length >= 5);
check('19. resultate.html: MERKMAL_FILTER-synonyme definiert', src['resultate.html'].includes('MERKMAL_FILTER'));
check('19. merkliste.html: vergleichs-toggle vorhanden', src['merkliste.html'].includes('id="vergleich-btn"'));
check('19. merkliste.html: vergleichstabelle wird gebaut', src['merkliste.html'].includes('vergleich-tabelle'));
check('19. merkliste.html: tabelle scrollt im eigenen container (overflow-x)',
  src['merkliste.html'].includes('overflow-x: auto'));

/* --- 20. expose-druckansicht (paket C, 17.08.2026) --- */
check('20. inserat.html: print-stylesheet vorhanden', src['inserat.html'].includes('@media print'));
check('20. inserat.html: expose-drucken-button vorhanden', src['inserat.html'].includes('id="expose-drucken"'));
check('20. inserat.html: druck-fusszeile mit demo-kennzeichnung',
  src['inserat.html'].includes('Demo-Exposé mit fiktiven Beispieldaten'));
check('20. inserat.html: interaktives im druck ausgeblendet',
  /@media print[\s\S]*#anfrage[\s\S]*display:\s*none/.test(src['inserat.html']));

/* --- 21. kartenansicht (paket D, 17.08.2026) --- */
check('21. resultate.html: ansicht-toggle liste/karte', src['resultate.html'].includes('data-ansicht="karte"'));
check('21. resultate.html: karten-svg-container vorhanden', src['resultate.html'].includes('id="karten-svg"'));
check('21. resultate.html: karte ehrlich als schematisch gekennzeichnet',
  src['resultate.html'].includes('Lagen sind schematisch'));
if (Array.isArray(listings)) {
  const orteAlle = [...new Set(listings.map((l) => l.ort))];
  const ohnePin = orteAlle.filter((o) => !src['resultate.html'].includes(`['${o}',`));
  check('21. jeder daten-ort hat einen karten-pin', ohnePin.length === 0, ohnePin.join(', '));
}

/* --- 22. inserenten-dashboard-demo (paket F, 17.08.2026) --- */
check('22. mein-bereich.html: als demo-vorschau gekennzeichnet',
  src['mein-bereich.html'].includes('Demo-Vorschau') && src['mein-bereich.html'].includes('Beispieldaten'));
check('22. mein-bereich.html: verwaltungs-buttons ehrlich deaktiviert',
  /disabled aria-disabled="true"/.test(src['mein-bereich.html']));
check('22. inserieren.html verlinkt den demo-bereich', src['inserieren.html'].includes('mein-bereich.html'));

/* --- 23. ratgeber-bereich (paket E, 17.08.2026) --- */
{
  const ARTIKEL = ['ratgeber-besichtigung.html', 'ratgeber-kaufnebenkosten.html', 'ratgeber-umzug.html'];
  const fehltUebersicht = ARTIKEL.filter((a) => !src['ratgeber.html'].includes(`href="${a}"`));
  check('23. ratgeber.html verlinkt alle 3 artikel', fehltUebersicht.length === 0, fehltUebersicht.join(', '));
  for (const a of ARTIKEL) {
    check(`23. ${a}: zurueck-link zum ratgeber`, src[a].includes('href="ratgeber.html"'));
    check(`23. ${a}: demo-/haftungs-hinweis vorhanden`,
      src[a].includes('Demo-Inhalt des Prototyps') && /Rechts(?:-|beratung)/.test(src[a]));
  }
  const headerBlock = block(src['index.html'], '<!-- ws:header -->', '<!-- /ws:header -->') || '';
  check('23. hauptnav enthaelt ratgeber-link', headerBlock.includes('href="ratgeber.html"'));
}

/* --- 24. foto-galerien (paket A, 17.08.2026) --- */
if (Array.isArray(listings)) {
  const ohneGalerie = listings.filter((l) => !Array.isArray(l.fotos) || l.fotos.length < 2);
  check('24. jedes inserat hat >=2 galerie-fotos', ohneGalerie.length === 0,
    ohneGalerie.map((l) => l.id).join(', '));
  const fehlend = [];
  for (const l of listings) {
    for (const f of (l.fotos || [])) {
      const basis = f.replace(/\.jpg$/, '');
      if (!existsSync(join(DIR, f)) || !existsSync(join(DIR, basis + '-640.webp'))) { fehlend.push(f); }
    }
  }
  check('24. alle galerie-dateien inkl. webp vorhanden', fehlend.length === 0, fehlend.slice(0, 4).join(', '));
  try {
    const lizenz2 = readFileSync(join(DIR, 'MEDIA-LICENSES.md'), 'utf8');
    const undok2 = listings.flatMap((l) => l.fotos || []).filter((f) => !lizenz2.includes(f.replace('assets/', '')));
    check('24. MEDIA-LICENSES dokumentiert alle galerie-fotos', undok2.length === 0, undok2.slice(0, 4).join(', '));
  } catch (e) {
    check('24. MEDIA-LICENSES lesbar', false, String(e.message || e));
  }
}
check('24. inserat.html: galerie rendert inserat.fotos mit symbolbild-kennzeichnung',
  src['inserat.html'].includes('inserat.fotos') && src['inserat.html'].includes('Symbolbild'));

/* --- 15. hero-hintergrundbild auf der startseite --- */
check('15. index.html: hero-bild-element vorhanden', src['index.html'].includes('class="hero-bild"'));
check('15. styles.css: hero-bild referenziert assets/hero-zuhause.webp',
  src['styles.css'].includes('assets/hero-zuhause.webp'));
check('15. assets/hero-zuhause.webp vorhanden', existsSync(join(DIR, 'assets/hero-zuhause.webp')));
check('15. assets/hero-zuhause.jpg (quelle) vorhanden', existsSync(join(DIR, 'assets/hero-zuhause.jpg')));

/* --- 18. webp-auslieferung mit jpg-fallback (paket 4, 17.08.2026) --- */
if (Array.isArray(listings)) {
  const ohneWebp = listings.filter((l) => {
    if (!l.foto) { return false; }
    const basis = l.foto.replace(/\.jpg$/, '');
    return !existsSync(join(DIR, basis + '-640.webp')) || !existsSync(join(DIR, basis + '.webp'));
  });
  check('18. jede foto-quelle hat -640.webp und .webp', ohneWebp.length === 0,
    ohneWebp.map((l) => l.id).join(', '));
}
check('18. app.js: renderCard liefert <picture> mit webp-source',
  src['app.js'].includes('<picture>') && src['app.js'].includes('image/webp'));
check('18. inserat.html: kopfbild als <picture> mit webp-source',
  src['inserat.html'].includes('image/webp'));

/* ------------------------------------------------------------------ */
console.log('');
console.log(`ergebnis: ${pass} PASS, ${fail} FAIL (${pass + fail} checks)`);
if (fail > 0) {
  console.log('rote checks:');
  for (const n of failed) { console.log('  - ' + n); }
  process.exit(1);
}
