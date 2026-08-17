/* wohnsignal — schlanke auth-schicht (phase 2, magic link).
   direkte supabase-gotrue-rest-calls statt fremdbibliothek: transparent,
   kein build, kein cdn. es gibt bewusst KEIN passwort — anmeldung laeuft
   ausschliesslich ueber einen e-mail-link. ohne WS_KONFIG bleibt alles inert. */
(function () {
  'use strict';

  var SITZUNG_KEY = 'ws:auth';
  var konf = window.WS_KONFIG || {};
  var basis = (konf.supabaseUrl || '').replace(/\/$/, '');
  var anon = konf.supabaseAnonKey || '';

  function aktiv() {
    return Boolean(basis && anon);
  }

  /* ---------- sitzung im localStorage ---------- */

  function leseSitzung() {
    try {
      var raw = window.localStorage.getItem(SITZUNG_KEY);
      var s = raw ? JSON.parse(raw) : null;
      return (s && s.access_token && s.refresh_token) ? s : null;
    } catch (e) {
      return null;
    }
  }

  function speichereSitzung(s) {
    try {
      window.localStorage.setItem(SITZUNG_KEY, JSON.stringify(s));
    } catch (e) { /* privater modus — dann gibt es eben keine dauerhafte sitzung */ }
  }

  function loescheSitzung() {
    try { window.localStorage.removeItem(SITZUNG_KEY); } catch (e) { /* egal */ }
  }

  /* jwt-payload dekodieren (base64url) — nur fuer anzeige (email) und uid */
  function tokenDaten(token) {
    try {
      var teil = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(window.atob(teil))));
    } catch (e) {
      return {};
    }
  }

  /* ---------- gotrue-rest ---------- */

  function gotrue(pfad, optionen) {
    optionen = optionen || {};
    optionen.headers = optionen.headers || {};
    optionen.headers.apikey = anon;
    if (!optionen.headers['Content-Type'] && optionen.body) {
      optionen.headers['Content-Type'] = 'application/json';
    }
    return fetch(basis + '/auth/v1' + pfad, optionen);
  }

  /* magic link anfordern; supabase legt neue nutzer automatisch an */
  function login(email, weiterZu) {
    var redirect = weiterZu || (window.location.origin + window.location.pathname);
    return gotrue('/otp?redirect_to=' + encodeURIComponent(redirect), {
      method: 'POST',
      body: JSON.stringify({ email: email, create_user: true })
    }).then(function (res) {
      if (res.ok) { return { ok: true }; }
      return res.json().catch(function () { return {}; }).then(function (d) {
        return { ok: false, fehler: d.msg || d.error_description || d.message || ('HTTP ' + res.status) };
      });
    });
  }

  /* nach dem klick auf den mail-link: #access_token=...&refresh_token=... */
  function verarbeiteCallback() {
    var hash = window.location.hash || '';
    if (hash.indexOf('access_token=') === -1) { return false; }
    var p = new URLSearchParams(hash.replace(/^#/, ''));
    var access = p.get('access_token');
    var refresh = p.get('refresh_token');
    if (!access || !refresh) { return false; }
    var lebt = parseInt(p.get('expires_in') || '3600', 10);
    speichereSitzung({
      access_token: access,
      refresh_token: refresh,
      expires_at: Math.floor(Date.now() / 1000) + lebt
    });
    /* token aus der adresszeile entfernen (auch aus dem verlauf) */
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (e) { /* egal */ }
    return true;
  }

  function erneuere(s) {
    return gotrue('/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (res) {
      if (!res.ok) { loescheSitzung(); return null; }
      return res.json().then(function (d) {
        var neu = {
          access_token: d.access_token,
          refresh_token: d.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600)
        };
        speichereSitzung(neu);
        return neu;
      });
    }).catch(function () { return null; });
  }

  /* gueltige sitzung liefern (mit auto-refresh) oder null */
  function sitzung() {
    var s = leseSitzung();
    if (!s || !aktiv()) { return Promise.resolve(null); }
    if (s.expires_at - 60 > Math.floor(Date.now() / 1000)) { return Promise.resolve(s); }
    return erneuere(s);
  }

  function abmelden() {
    var s = leseSitzung();
    loescheSitzung();
    if (!s || !aktiv()) { return Promise.resolve(); }
    return gotrue('/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + s.access_token }
    }).catch(function () { /* lokal ist die sitzung bereits weg */ }).then(function () { return; });
  }

  /* ---------- postgrest (fuer eingeloggte daten-zugriffe) ---------- */

  function rest(pfad, optionen) {
    optionen = optionen || {};
    return sitzung().then(function (s) {
      optionen.headers = optionen.headers || {};
      optionen.headers.apikey = anon;
      optionen.headers.Authorization = 'Bearer ' + (s ? s.access_token : anon);
      if (!optionen.headers['Content-Type'] && optionen.body) {
        optionen.headers['Content-Type'] = 'application/json';
      }
      return fetch(basis + '/rest/v1' + pfad, optionen);
    });
  }

  /* datei in einen storage-bucket laden (nur mit sitzung; RLS prueft den ordner) */
  function storageUpload(bucket, pfad, blob) {
    return sitzung().then(function (s) {
      if (!s) { return Promise.reject(new Error('keine sitzung')); }
      return fetch(basis + '/storage/v1/object/' + bucket + '/' + pfad, {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: 'Bearer ' + s.access_token,
          'Content-Type': blob.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: blob
      });
    });
  }

  window.WS_AUTH = {
    aktiv: aktiv,
    login: login,
    sitzung: sitzung,
    abmelden: abmelden,
    verarbeiteCallback: verarbeiteCallback,
    tokenDaten: tokenDaten,
    rest: rest,
    storageUpload: storageUpload
  };
})();
