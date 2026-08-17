/* wohnsignal — laufzeit-konfiguration (phase 2).
   leere werte = die seite verhaelt sich wie der reine demo-prototyp
   (formulare im vorschau-modus, kein login). supabase ist der einzige
   erlaubte externe host — verify.mjs erzwingt das.
   KEINE geheimnisse hier: anon-key und endpunkt sind fuer den browser
   bestimmt; die zugriffskontrolle liegt serverseitig in RLS. */
window.WS_KONFIG = {
  supabaseUrl: "https://qxffxypzagjqonpkxayk.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZmZ4eXB6YWdqcW9ucGt4YXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODUzMjksImV4cCI6MjEwMjU2MTMyOX0.kx61qyr3U2defkDUOAlv1rkxmuxKkZlrLha5d1O96JM",
  anfrageEndpunkt: "https://qxffxypzagjqonpkxayk.supabase.co/functions/v1/anfrage"
};
