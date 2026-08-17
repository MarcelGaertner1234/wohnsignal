/* wohnsignal — gemeinsame helfer (kein framework, kein build, laeuft per file://) */
(function () {
  'use strict';

  var FAV_KEY = 'ws:favs';

  /* svg-szenen-palette v2 «warme stunde»: daemmerungshimmel, espresso-silhouetten,
     golden erleuchtete fenster, salbei-gruen — heimelig statt technisch */
  var P = {
    grund: '#2a1f1a',
    fern: '#4a382d',
    boden: '#33261e',
    bau: '#463428',
    bauHell: '#5a4535',
    kontur: '#6f573f',
    wasser: '#3d5a66',
    chalk: '#f7ecd9',
    rust: '#c96f43',
    lampe: '#f6bd66',            /* warmes fensterlicht */
    laub: '#5f6f4e',             /* baeume und hecken */
    rasen: '#51603f'
  };

  /* himmels-verlaeufe (deterministisch je objekt): abendrot · daemmerung · morgengold */
  var HIMMEL = [
    ['#3a2634', '#6e3b32', '#c97b4f', '#e8a06a'],
    ['#2c2531', '#4a3844', '#8a5a4a', '#d99a6e'],
    ['#3d4a57', '#7a6a5a', '#d9a86e', '#f0c98f']
  ];
  /* papier-verlauf fuer plan-szenen (grundriss, lageplan) */
  var PAPIER_HIMMEL = ['#f6eedc', '#f0e4cc', '#eadcc2', '#e4d4b6'];

  /* ---------- basis-helfer ---------- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tausender(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  }

  /* "CHF 1'850" */
  function formatChf(n) {
    return 'CHF ' + tausender(n);
  }

  /* miete: "CHF 2'380 / Mt." — kauf: "CHF 985'000" */
  function formatPreis(listing) {
    var basis = formatChf(listing.preisChf);
    return listing.angebot === 'miete' ? basis + ' / Mt.' : basis;
  }

  /* akzeptiert listing ODER zahl; kurz=true -> "2.5 Zi.", sonst "2.5 Zimmer" */
  function formatZimmer(x, kurz) {
    var z = (x && typeof x === 'object') ? x.zimmer : x;
    return z + (kurz ? ' Zi.' : ' Zimmer');
  }

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  function getListing(id) {
    var data = window.WS_DATA;
    if (!data || !data.listings) { return null; }
    for (var i = 0; i < data.listings.length; i++) {
      if (data.listings[i].id === id) { return data.listings[i]; }
    }
    return null;
  }

  /* ---------- favoriten (localStorage in try/catch) ---------- */

  function getFavs() {
    try {
      var raw = window.localStorage.getItem(FAV_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function setFavs(arr) {
    try {
      window.localStorage.setItem(FAV_KEY, JSON.stringify(arr));
    } catch (e) { /* privater modus etc. — still ignorieren */ }
  }

  function isFav(id) {
    return getFavs().indexOf(id) > -1;
  }

  /* liefert true wenn das inserat NACH dem toggle gemerkt ist */
  function toggleFav(id) {
    var favs = getFavs();
    var i = favs.indexOf(id);
    if (i > -1) { favs.splice(i, 1); } else { favs.push(id); }
    setFavs(favs);
    return i === -1;
  }

  /* ---------- deterministische svg-szenen ---------- */

  function idSeed(id) {
    var s = 7;
    var str = String(id || '');
    for (var i = 0; i < str.length; i++) {
      s = (s * 31 + str.charCodeAt(i)) >>> 0;
    }
    return s;
  }

  /* fensterraster; opts: fill, op, lit (seed — steuert, WELCHE fenster warm leuchten).
     etwa jedes dritte fenster bekommt goldenes lampenlicht: bewohnt statt technisch */
  function fensterRaster(x, y, cols, rows, w, h, gx, gy, opts) {
    opts = opts || {};
    var fill = opts.fill || P.chalk;
    var op = (opts.op != null) ? opts.op : 0.14;
    var lit = (opts.lit != null) ? opts.lit : -1;
    var out = '';
    var i = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var fx = x + c * (w + gx);
        var fy = y + r * (h + gy);
        if (lit >= 0 && ((i * 7 + lit) % 3) === 0) {
          out += '<rect x="' + (fx - 1.5) + '" y="' + (fy - 1.5) + '" width="' + (w + 3) + '" height="' + (h + 3) + '" fill="' + P.lampe + '" fill-opacity="0.22" rx="2"/>';
          out += '<rect x="' + fx + '" y="' + fy + '" width="' + w + '" height="' + h + '" fill="' + P.lampe + '" fill-opacity="0.92" rx="1"/>';
        } else {
          out += '<rect x="' + fx + '" y="' + fy + '" width="' + w + '" height="' + h + '" fill="' + fill + '" fill-opacity="' + op + '" rx="1"/>';
        }
        i++;
      }
    }
    return out;
  }

  /* standort-pin: konzentrische kreise (r24 @17%, r12 voll, r4.6 chalk) */
  function marker(x, y) {
    return '<circle cx="' + x + '" cy="' + y + '" r="24" fill="' + P.rust + '" fill-opacity="0.17"/>'
      + '<circle cx="' + x + '" cy="' + y + '" r="12" fill="' + P.rust + '"/>'
      + '<circle cx="' + x + '" cy="' + y + '" r="4.6" fill="' + P.chalk + '"/>';
  }

  /* tiefstehende sonne mit warmem hof */
  function sonne(x, y) {
    return '<circle cx="' + x + '" cy="' + y + '" r="52" fill="' + P.lampe + '" fill-opacity="0.14"/>'
      + '<circle cx="' + x + '" cy="' + y + '" r="30" fill="' + P.lampe + '" fill-opacity="0.28"/>'
      + '<circle cx="' + x + '" cy="' + y + '" r="15" fill="#f2a54d"/>';
  }

  function sceneFassade(seed) {
    var off = seed % 24;
    var out = '';
    out += '<rect x="' + (10 + off) + '" y="150" width="110" height="180" fill="' + P.fern + '" rx="2"/>';
    out += '<rect x="' + (500 - off) + '" y="130" width="130" height="200" fill="' + P.fern + '" rx="2"/>';
    /* hauptgebaeude mit balkonbaendern */
    out += '<rect x="150" y="80" width="210" height="250" fill="' + P.bau + '" rx="2"/>';
    out += fensterRaster(170, 104, 4, 5, 26, 24, 16, 18, { lit: seed % 20 });
    for (var r = 0; r < 5; r++) {
      out += '<rect x="146" y="' + (132 + r * 42) + '" width="218" height="3" fill="' + P.bauHell + '"/>';
    }
    out += '<rect x="386" y="120" width="150" height="210" fill="' + P.bau + '" rx="2"/>';
    out += fensterRaster(402, 142, 3, 5, 24, 22, 15, 16, { op: 0.1 });
    /* tramfahrleitungen */
    out += '<path d="M0 58 C 220 78, 420 66, 640 84" stroke="' + P.kontur + '" stroke-width="2" fill="none"/>';
    out += '<path d="M0 74 C 220 94, 420 82, 640 100" stroke="' + P.bauHell + '" stroke-width="1.5" fill="none"/>';
    out += '<line x1="180" y1="70" x2="180" y2="86" stroke="' + P.kontur + '" stroke-width="1.5"/>';
    out += '<line x1="430" y1="66" x2="430" y2="82" stroke="' + P.kontur + '" stroke-width="1.5"/>';
    /* strasse */
    out += '<rect x="0" y="330" width="640" height="70" fill="' + P.boden + '"/>';
    out += '<line x1="0" y1="356" x2="640" y2="356" stroke="' + P.kontur + '" stroke-width="2" stroke-dasharray="14 18"/>';
    return out;
  }

  function sceneInnenhof(seed) {
    var out = '';
    /* hoffassade hinter dem fenster */
    out += '<rect x="60" y="90" width="520" height="250" fill="' + P.fern + '" rx="2"/>';
    out += fensterRaster(96, 120, 6, 3, 30, 34, 44, 40, { op: 0.08, lit: seed % 18 });
    /* baum im hof */
    out += '<circle cx="238" cy="286" r="46" fill="' + P.laub + '"/>';
    out += '<rect x="234" y="300" width="8" height="52" fill="' + P.kontur + '" rx="2"/>';
    /* grosses fenster von innen: rahmen + sprossen */
    out += '<rect x="140" y="40" width="360" height="320" fill="none" stroke="' + P.chalk + '" stroke-opacity="0.55" stroke-width="3"/>';
    out += '<line x1="320" y1="40" x2="320" y2="360" stroke="' + P.chalk + '" stroke-opacity="0.4" stroke-width="2"/>';
    out += '<line x1="140" y1="200" x2="500" y2="200" stroke="' + P.chalk + '" stroke-opacity="0.4" stroke-width="2"/>';
    /* fenstersims + rust-pflanzentopf */
    out += '<rect x="120" y="360" width="400" height="6" fill="' + P.kontur + '"/>';
    out += '<rect x="440" y="336" width="26" height="24" fill="' + P.rust + '"/>';
    out += '<path d="M453 336 C 448 324, 444 320, 438 316 M453 336 C 456 322, 462 318, 468 314" stroke="' + P.chalk + '" stroke-opacity="0.5" stroke-width="1.5" fill="none"/>';
    /* morgenlicht faellt warm herein */
    out += '<polygon points="500,40 640,40 640,400 560,400" fill="' + P.lampe + '" fill-opacity="0.10"/>';
    return out;
  }

  function sceneIndustrie(seed) {
    var out = '';
    /* sheddach */
    for (var i = 0; i < 5; i++) {
      var x = 40 + i * 112;
      out += '<polygon points="' + x + ',120 ' + (x + 72) + ',64 ' + (x + 112) + ',120" fill="' + P.bauHell + '"/>';
    }
    /* fabrikkoerper + backstein-fugen */
    out += '<rect x="40" y="120" width="560" height="210" fill="' + P.bau + '" rx="2"/>';
    out += '<line x1="40" y1="140" x2="600" y2="140" stroke="' + P.bauHell + '" stroke-width="1"/>';
    out += '<line x1="40" y1="320" x2="600" y2="320" stroke="' + P.bauHell + '" stroke-width="1"/>';
    /* grosses industriefenster-raster */
    out += fensterRaster(70, 154, 8, 3, 48, 36, 18, 20, { op: 0.1, lit: seed % 24 });
    /* kamin */
    out += '<rect x="556" y="30" width="26" height="90" fill="' + P.kontur + '" rx="2"/>';
    out += '<rect x="0" y="330" width="640" height="70" fill="' + P.boden + '"/>';
    return out;
  }

  function sceneGarten(seed) {
    var out = '';
    out += sonne(500 - (seed % 30), 108);
    /* wohnzeile links */
    out += '<rect x="0" y="140" width="260" height="152" fill="' + P.bau + '" rx="2"/>';
    out += fensterRaster(24, 162, 4, 2, 30, 30, 22, 26, { op: 0.12, lit: seed % 8 });
    out += '<rect x="196" y="238" width="34" height="54" fill="' + P.bauHell + '"/>';
    /* hecke */
    for (var i = 0; i < 8; i++) {
      out += '<rect x="' + (284 + i * 44) + '" y="252" width="40" height="46" fill="' + P.laub + '" rx="8"/>';
    }
    /* rasen */
    out += '<rect x="0" y="292" width="640" height="108" fill="' + P.rasen + '"/>';
    /* familientisch (abstrakt, ohne menschen) */
    out += '<rect x="360" y="318" width="96" height="8" fill="' + P.kontur + '" rx="2"/>';
    out += '<line x1="372" y1="326" x2="372" y2="356" stroke="' + P.kontur + '" stroke-width="4"/>';
    out += '<line x1="444" y1="326" x2="444" y2="356" stroke="' + P.kontur + '" stroke-width="4"/>';
    out += '<rect x="480" y="332" width="60" height="5" fill="' + P.kontur + '" rx="2"/>';
    /* baum rechts */
    out += '<circle cx="590" cy="250" r="42" fill="' + P.laub + '"/>';
    out += '<rect x="585" y="266" width="9" height="60" fill="' + P.kontur + '" rx="2"/>';
    return out;
  }

  function sceneNeubau(seed) {
    var out = '';
    /* flacher riegel links */
    out += '<rect x="30" y="180" width="240" height="150" fill="' + P.fern + '" rx="2"/>';
    out += fensterRaster(50, 200, 4, 2, 34, 34, 18, 28, { op: 0.1 });
    /* turm mit versetzten balkonen */
    out += '<rect x="360" y="40" width="200" height="290" fill="' + P.bau + '" rx="2"/>';
    out += fensterRaster(384, 62, 3, 6, 28, 22, 26, 22, { op: 0.12, lit: seed % 18 });
    for (var r = 0; r < 6; r++) {
      var bx = 340 + (r % 2) * 60;
      var by = 88 + r * 44;
      out += '<rect x="' + bx + '" y="' + by + '" width="140" height="12" fill="' + P.bauHell + '" rx="2"/>';
      out += '<line x1="' + (bx + 18) + '" y1="' + (by - 14) + '" x2="' + (bx + 18) + '" y2="' + by + '" stroke="' + P.chalk + '" stroke-opacity="0.25" stroke-width="1.5"/>';
      out += '<line x1="' + (bx + 70) + '" y1="' + (by - 14) + '" x2="' + (bx + 70) + '" y2="' + by + '" stroke="' + P.chalk + '" stroke-opacity="0.25" stroke-width="1.5"/>';
      out += '<line x1="' + (bx + 122) + '" y1="' + (by - 14) + '" x2="' + (bx + 122) + '" y2="' + by + '" stroke="' + P.chalk + '" stroke-opacity="0.25" stroke-width="1.5"/>';
    }
    /* baumreihe */
    var baumX = [80, 180, 280, 610];
    for (var i = 0; i < baumX.length; i++) {
      out += '<circle cx="' + baumX[i] + '" cy="308" r="20" fill="' + P.laub + '"/>';
      out += '<rect x="' + (baumX[i] - 3) + '" y="320" width="6" height="24" fill="' + P.kontur + '" rx="2"/>';
    }
    out += '<rect x="0" y="340" width="640" height="60" fill="' + P.boden + '"/>';
    return out;
  }

  function sceneBerge(seed) {
    var out = '';
    out += sonne((seed % 2 === 0) ? 120 : 520, 86);
    /* bergketten */
    out += '<polygon points="0,220 120,148 240,206 360,128 500,192 640,150 640,400 0,400" fill="' + P.fern + '"/>';
    out += '<polygon points="0,262 180,190 330,252 520,182 640,232 640,400 0,400" fill="' + P.bau + '"/>';
    out += '<path d="M0 262 L180 190 L330 252 L520 182 L640 232" stroke="' + P.kontur + '" stroke-width="1.5" fill="none"/>';
    /* seeflaeche mit warmen lichtreflexen */
    out += '<rect x="0" y="290" width="640" height="72" fill="' + P.wasser + '"/>';
    out += '<line x1="60" y1="312" x2="200" y2="312" stroke="' + P.lampe + '" stroke-opacity="0.4" stroke-width="2"/>';
    out += '<line x1="320" y1="330" x2="500" y2="330" stroke="' + P.lampe + '" stroke-opacity="0.3" stroke-width="2"/>';
    /* segelboot */
    out += '<polygon points="470,318 470,296 486,318" fill="' + P.chalk + '" fill-opacity="0.65"/>';
    out += '<line x1="460" y1="320" x2="492" y2="320" stroke="' + P.chalk + '" stroke-opacity="0.65" stroke-width="3"/>';
    /* terrassen-gelaender im vordergrund */
    out += '<line x1="0" y1="366" x2="640" y2="366" stroke="' + P.chalk + '" stroke-opacity="0.35" stroke-width="3"/>';
    for (var x = 20; x < 640; x += 40) {
      out += '<line x1="' + x + '" y1="366" x2="' + x + '" y2="400" stroke="' + P.chalk + '" stroke-opacity="0.22" stroke-width="1.5"/>';
    }
    return out;
  }

  function sceneHaus(seed) {
    var out = '';
    /* steile bergflanken */
    out += '<polygon points="0,246 200,56 430,246" fill="' + P.fern + '"/>';
    out += '<polygon points="240,246 440,84 640,246" fill="' + P.bauHell + '" fill-opacity="0.55"/>';
    out += '<path d="M0 246 L200 56 L430 246 M240 246 L440 84 L640 246" stroke="' + P.kontur + '" stroke-width="1" fill="none"/>';
    out += '<rect x="0" y="246" width="640" height="154" fill="' + P.boden + '"/>';
    /* haus mit satteldach + kamin */
    out += '<polygon points="228,206 320,144 412,206" fill="' + P.bauHell + '"/>';
    out += '<rect x="240" y="206" width="160" height="108" fill="' + P.bau + '" rx="2"/>';
    out += '<rect x="366" y="152" width="16" height="40" fill="' + P.kontur + '" rx="2"/>';
    out += fensterRaster(256, 226, 2, 1, 28, 26, 18, 0, { op: 0.15, lit: (seed % 2 === 0) ? 1 : -1 });
    out += '<rect x="336" y="258" width="26" height="56" fill="' + ((seed % 2 === 0) ? P.bauHell : P.rust) + '"/>';
    /* werkstatt-anbau */
    out += '<rect x="404" y="246" width="92" height="68" fill="' + P.bauHell + '" rx="2"/>';
    out += '<rect x="420" y="266" width="60" height="48" fill="' + P.grund + '" rx="2"/>';
    /* gartenzaun + baum */
    for (var x = 60; x < 220; x += 22) {
      out += '<line x1="' + x + '" y1="300" x2="' + x + '" y2="324" stroke="' + P.kontur + '" stroke-width="2"/>';
    }
    out += '<line x1="56" y1="304" x2="220" y2="304" stroke="' + P.kontur + '" stroke-width="1.5"/>';
    out += '<circle cx="560" cy="240" r="34" fill="' + P.laub + '"/>';
    out += '<rect x="556" y="256" width="8" height="52" fill="' + P.kontur + '" rx="2"/>';
    return out;
  }

  function sceneFluss(seed) {
    var out = '';
    /* ferne bergline */
    out += '<polygon points="0,140 160,84 340,140 520,74 640,120 640,0 0,0" fill="' + P.fern + '" transform="translate(0,60) scale(1,-1) translate(0,-140)"/>';
    out += '<polygon points="0,120 160,64 340,120 520,54 640,100 640,120" fill="' + P.fern + '"/>';
    /* flusslauf */
    out += '<path d="M-20 330 C 150 306, 240 216, 330 192 S 560 118, 660 108" stroke="' + P.wasser + '" stroke-width="58" fill="none" stroke-linecap="round"/>';
    /* uferweg */
    out += '<path d="M-20 372 C 160 348, 260 256, 350 230 S 580 156, 660 148" stroke="' + P.kontur + '" stroke-width="3" fill="none" stroke-dasharray="10 12"/>';
    /* wohnhaeuser beidseitig */
    var haeuser = [[70, 210], [150, 170], [430, 250], [520, 220], [90, 120], [560, 300]];
    for (var i = 0; i < haeuser.length; i++) {
      var hx = haeuser[i][0];
      var hy = haeuser[i][1];
      out += '<rect x="' + hx + '" y="' + hy + '" width="52" height="40" fill="' + P.bau + '" rx="2"/>';
      out += '<rect x="' + (hx + 8) + '" y="' + (hy + 10) + '" width="10" height="10" fill="' + P.chalk + '" fill-opacity="0.14"/>';
      out += '<rect x="' + (hx + 30) + '" y="' + (hy + 10) + '" width="10" height="10" fill="' + P.chalk + '" fill-opacity="0.14"/>';
    }
    /* bruecke */
    out += '<rect x="292" y="196" width="80" height="9" fill="' + P.kontur + '" rx="2"/>';
    /* standort-pin am objekt */
    out += marker((seed % 2 === 0) ? 176 : 456, (seed % 2 === 0) ? 158 : 238);
    return out;
  }

  /* grundriss-schema: warme tuschezeichnung auf papier, raumaufteilung folgt der zimmerzahl */
  function sceneGrundriss(seed, listing) {
    var zimmer = (listing && listing.zimmer) || 3.5;
    var tinte = '#4a3a2b';
    var w = 'stroke="' + tinte + '" stroke-opacity="0.85" stroke-width="2" fill="none"';
    var d = 'stroke="' + tinte + '" stroke-opacity="0.45" stroke-width="1.2" fill="none"';
    var shift = seed % 24;
    var out = '';
    /* aussenmauer */
    out += '<rect x="120" y="56" width="400" height="288" ' + w + '/>';
    /* laengswand mit tueroeffnung */
    var wx = 300 + shift;
    out += '<line x1="' + wx + '" y1="56" x2="' + wx + '" y2="196" ' + w + '/>';
    out += '<line x1="' + wx + '" y1="232" x2="' + wx + '" y2="344" ' + w + '/>';
    /* querwaende: ab 3 zimmern eine zweite, ab 5 eine dritte */
    out += '<line x1="120" y1="200" x2="' + (wx - 36) + '" y2="200" ' + w + '/>';
    if (zimmer >= 3) { out += '<line x1="' + (wx + 36) + '" y1="152" x2="520" y2="152" ' + w + '/>'; }
    if (zimmer >= 5) { out += '<line x1="' + (wx + 36) + '" y1="248" x2="520" y2="248" ' + w + '/>'; }
    /* tuerfluegel als viertelkreise */
    out += '<path d="M' + wx + ' 232 A 36 36 0 0 1 ' + (wx - 36) + ' 196" ' + d + '/>';
    out += '<path d="M' + (wx - 36) + ' 200 A 32 32 0 0 0 ' + (wx - 68) + ' 168" ' + d + '/>';
    /* nasszelle oben links: wanne + lavabo angedeutet */
    out += '<rect x="136" y="72" width="64" height="28" ' + d + '/>';
    out += '<circle cx="230" cy="86" r="12" ' + d + '/>';
    /* kuechenzeile unten links */
    out += '<line x1="120" y1="312" x2="252" y2="312" ' + d + '/>';
    out += '<circle cx="160" cy="326" r="6" ' + d + '/><circle cx="184" cy="326" r="6" ' + d + '/>';
    /* balkon als gestrichelter anbau */
    out += '<rect x="520" y="96" width="52" height="120" stroke="' + tinte + '" stroke-opacity="0.5" stroke-width="1.2" stroke-dasharray="5 5" fill="none"/>';
    /* eingang: rust-marke an der schwelle */
    out += '<rect x="' + (wx - 5) + '" y="340" width="10" height="8" fill="' + P.rust + '"/>';
    /* massband unten */
    out += '<line x1="120" y1="372" x2="520" y2="372" ' + d + '/>';
    out += '<line x1="120" y1="366" x2="120" y2="378" ' + d + '/>';
    out += '<line x1="520" y1="366" x2="520" y2="378" ' + d + '/>';
    return out;
  }

  /* stilisierte stadtkarte auf papier: quartiere, fluss, terracotta-pin am objekt */
  function sceneKarte(seed, listing) {
    var out = '';
    var s = 'stroke="#8a7a63" stroke-width="3" fill="none"';
    var f = 'stroke="#b9a88c" stroke-width="1.5" fill="none"';
    /* quartier-bloecke */
    var bloecke = [[40, 50, 120, 90], [200, 40, 150, 100], [400, 60, 130, 80], [60, 180, 100, 110], [420, 180, 140, 90], [200, 300, 160, 70], [430, 300, 120, 80]];
    for (var i = 0; i < bloecke.length; i++) {
      out += '<rect x="' + bloecke[i][0] + '" y="' + bloecke[i][1] + '" width="' + bloecke[i][2] + '" height="' + bloecke[i][3] + '" fill="#e6d7bc" rx="3"/>';
    }
    /* park im quartier */
    out += '<rect x="60" y="180" width="100" height="110" fill="#cdd4b2" rx="3"/>';
    /* flusslauf quer durchs quartier */
    out += '<path d="M-20 260 C 140 236, 300 250, 420 220 S 620 168, 660 160" stroke="#9cc0c4" stroke-width="26" fill="none" stroke-linecap="round"/>';
    /* hauptstrassen */
    out += '<line x1="0" y1="150" x2="640" y2="150" ' + s + '/>';
    out += '<line x1="380" y1="0" x2="380" y2="400" ' + s + '/>';
    out += '<line x1="180" y1="0" x2="180" y2="400" ' + f + '/>';
    out += '<line x1="0" y1="300" x2="640" y2="300" ' + f + '/>';
    /* bahnlinie */
    out += '<line x1="0" y1="60" x2="640" y2="20" stroke="#8a7a63" stroke-width="2" stroke-dasharray="12 8"/>';
    /* pin am objekt — position deterministisch aus dem seed */
    var px = 220 + (seed % 3) * 90;
    var py = 180 + (seed % 2) * 70;
    out += marker(px, py);
    return out;
  }

  var SZENEN = {
    fassade: { titel: 'stadtfassade', bau: sceneFassade },
    innenhof: { titel: 'innenhofblick', bau: sceneInnenhof },
    industrie: { titel: 'industriefenster', bau: sceneIndustrie },
    garten: { titel: 'gartensitzplatz', bau: sceneGarten },
    neubau: { titel: 'neubaufassade', bau: sceneNeubau },
    berge: { titel: 'aussicht auf see und berge', bau: sceneBerge },
    haus: { titel: 'haus am hang', bau: sceneHaus },
    fluss: { titel: 'flusslage', bau: sceneFluss },
    /* nur per sceneOverride (galerie) — nie via sceneKey gewaehlt */
    grundriss: { titel: 'grundriss-schema', bau: sceneGrundriss },
    karte: { titel: 'lageplan', bau: sceneKarte }
  };

  /* szenen-wahl: deterministisch aus typ + sceneHint (fallback: id-hash) */
  function sceneKey(listing) {
    var hint = ((listing.sceneHint || '') + ' ' + (listing.titel || '')).toLowerCase();
    var typ = (listing.typ || '').toLowerCase();
    if (hint.indexOf('fluss') > -1 || hint.indexOf('uferweg') > -1) { return 'fluss'; }
    if (typ === 'haus') { return 'haus'; }
    if (typ === 'loft' || hint.indexOf('fabrik') > -1 || hint.indexOf('industrie') > -1) { return 'industrie'; }
    if (hint.indexOf('terrasse') > -1 || hint.indexOf('berg') > -1 || hint.indexOf('see') > -1) { return 'berge'; }
    if (hint.indexOf('neubau') > -1) { return 'neubau'; }
    if (hint.indexOf('gartensitzplatz') > -1 || hint.indexOf('spielplatz') > -1) { return 'garten'; }
    if (hint.indexOf('innenhof') > -1 || hint.indexOf('stuck') > -1) { return 'innenhof'; }
    if (typ === 'wohnung' || typ === 'studio' || typ === 'attika') { return 'fassade'; }
    var keys = ['fassade', 'innenhof', 'garten', 'neubau', 'berge'];
    return keys[idSeed(listing.id) % keys.length];
  }

  /* liefert kompletten inline-svg-string; variant: 'card' | 'hero' | 'thumb' (nur css-klasse).
     sceneOverride waehlt gezielt eine andere ansicht desselben objekts
     (z. b. 'grundriss' oder 'karte' fuer die detail-galerie). */
  function renderScene(listing, variant, sceneOverride) {
    var key = (sceneOverride && SZENEN[sceneOverride]) ? sceneOverride : sceneKey(listing);
    var seed = idSeed(listing.id);
    var szene = SZENEN[key] || SZENEN.fassade;
    var klass = 'szene szene--' + key + (variant ? ' szene--' + variant : '');
    /* gradient-ids muessen dokumentweit eindeutig sein (mehrere inline-svgs pro seite) */
    var gid = 'ws-h-' + key + '-' + seed + (variant ? '-' + variant : '') + (sceneOverride ? '-o' : '');
    var plan = (key === 'grundriss' || key === 'karte');
    var stops = plan ? PAPIER_HIMMEL : HIMMEL[seed % HIMMEL.length];
    var defs = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="' + stops[0] + '"/>'
      + '<stop offset="0.55" stop-color="' + stops[1] + '"/>'
      + '<stop offset="0.85" stop-color="' + stops[2] + '"/>'
      + '<stop offset="1" stop-color="' + stops[3] + '"/>'
      + '</linearGradient></defs>';
    var glut = plan ? '' : '<ellipse cx="320" cy="330" rx="380" ry="130" fill="' + P.lampe + '" fill-opacity="0.10"/>';
    return '<svg class="' + klass + '" viewBox="0 0 640 400" role="img" aria-label="designvisualisierung"'
      + ' preserveAspectRatio="xMidYMid slice" focusable="false">'
      + '<title>designvisualisierung · ' + szene.titel + '</title>'
      + defs
      + '<rect width="640" height="400" fill="url(#' + gid + ')"/>'
      + glut
      + szene.bau(seed, listing)
      + '</svg>';
  }

  /* ---------- inserat-karte ---------- */

  var HERZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-9-9c-1.2-2.8.6-6 3.8-6 2 0 3.4 1.2 5.2 3.4C13.8 6.2 15.2 5 17.2 5c3.2 0 5 3.2 3.8 6-2 4.5-9 9-9 9z"/></svg>';

  function renderCard(listing) {
    var id = escapeHtml(listing.id);
    var href = 'inserat.html?id=' + encodeURIComponent(listing.id);
    var gemerkt = isFav(listing.id);
    var merkmale = listing.merkmale || [];
    var tags = '';
    for (var i = 0; i < Math.min(3, merkmale.length); i++) {
      tags += '<li class="tag">' + escapeHtml(merkmale[i]) + '</li>';
    }
    if (merkmale.length > 3) {
      tags += '<li class="tag tag--mehr">+' + (merkmale.length - 3) + '</li>';
    }
    var media = listing.foto
      ? '<img src="' + escapeHtml(listing.foto) + '" alt="" loading="lazy">'
      : renderScene(listing, 'card');
    return '<article class="karte" data-id="' + id + '">'
      + '<div class="karte-media">'
      + '<a class="karte-media-link" href="' + href + '" tabindex="-1" aria-hidden="true">'
      + media
      + '</a>'
      + (listing.neu ? '<span class="badge badge--neu">neu</span>' : '')
      + '<button type="button" class="fav-btn" data-fav-id="' + id + '" aria-pressed="' + gemerkt + '" aria-label="' + escapeHtml('"' + listing.titel + '" merken') + '">' + HERZ + '</button>'
      + '<span class="media-status-label">' + formatZimmer(listing, true) + ' · ' + listing.flaecheM2 + ' m²</span>'
      + '</div>'
      + '<div class="karte-body">'
      + '<p class="karte-ort">' + escapeHtml(listing.ort) + ' ' + escapeHtml(listing.kanton) + ' · ' + escapeHtml(listing.strasse) + '</p>'
      + '<h3 class="karte-titel"><a href="' + href + '">' + escapeHtml(listing.titel) + '</a></h3>'
      + '<p class="karte-preis">' + formatPreis(listing)
      + (listing.angebot === 'kauf' ? ' <span class="preis-zusatz">Kaufpreis</span>' : '')
      + '</p>'
      + '<ul class="tags">' + tags + '</ul>'
      + '<p class="karte-meta">' + escapeHtml(listing.etage) + ' · Bezug ' + escapeHtml(listing.verfuegbarAb) + '</p>'
      + '</div>'
      + '</article>';
  }

  /* ---------- reveal-on-scroll ---------- */

  function initReveals() {
    var els = document.querySelectorAll('.reveal:not(.sichtbar)');
    var reduziert = false;
    try {
      reduziert = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* egal */ }
    if (reduziert || !('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) { els[i].classList.add('sichtbar'); }
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].isIntersecting) {
          entries[j].target.classList.add('sichtbar');
          io.unobserve(entries[j].target);
        }
      }
    }, { threshold: 0.1 });
    for (var k = 0; k < els.length; k++) { io.observe(els[k]); }
  }

  /* setzt aria-pressed aller fav-buttons gemaess localStorage */
  function syncFavButtons(root) {
    var scope = root || document;
    var btns = scope.querySelectorAll('[data-fav-id]');
    var favs = getFavs();
    for (var i = 0; i < btns.length; i++) {
      var an = favs.indexOf(btns[i].getAttribute('data-fav-id')) > -1;
      btns[i].setAttribute('aria-pressed', String(an));
    }
  }

  /* ---------- globale initialisierung ---------- */

  /* reveal-css nur aktiv wenn js laeuft */
  document.documentElement.classList.add('js');

  /* delegierter klick-handler: jeder [data-fav-id]-button funktioniert sofort */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-fav-id]') : null;
    if (!btn) { return; }
    var id = btn.getAttribute('data-fav-id');
    var an = toggleFav(id);
    syncFavButtons();
    try {
      document.dispatchEvent(new CustomEvent('ws:favchange', { detail: { id: id, gemerkt: an } }));
    } catch (err) { /* alte browser — still ignorieren */ }
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncFavButtons();
    initReveals();
  });

  /* ---------- api ---------- */

  window.WS = {
    formatChf: formatChf,
    formatPreis: formatPreis,
    formatZimmer: formatZimmer,
    renderScene: renderScene,
    renderCard: renderCard,
    getFavs: getFavs,
    isFav: isFav,
    toggleFav: toggleFav,
    qs: qs,
    getListing: getListing,
    escapeHtml: escapeHtml,
    initReveals: initReveals,
    syncFavButtons: syncFavButtons
  };
})();
