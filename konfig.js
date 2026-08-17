/* wohnsignal — laufzeit-konfiguration (phase 2).
   leere werte = die seite verhaelt sich wie der reine demo-prototyp
   (formulare im vorschau-modus). der anfrage-endpunkt zeigt auf unsere
   supabase edge function «anfrage» — der einzige erlaubte externe host,
   verify.mjs erzwingt das. KEINE geheimnisse hier: der endpunkt ist
   oeffentlich und durch cors, honeypot und rate-limit geschuetzt. */
window.WS_KONFIG = {
  anfrageEndpunkt: "https://qxffxypzagjqonpkxayk.supabase.co/functions/v1/anfrage"
};
