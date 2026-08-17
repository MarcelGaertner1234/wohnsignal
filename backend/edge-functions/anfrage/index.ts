// wohnsignal — edge function «anfrage» (phase 2)
// nimmt anfrage-formulare entgegen: validierung, honeypot, rate-limit,
// speichert in public.anfragen (service_role) und mailt via resend.
//
// benoetigte secrets (supabase dashboard -> edge functions -> secrets):
//   RESEND_API_KEY     resend.com api-key
//   PORTAL_EMPFANG     empfaenger-postfach, z. B. kontakt@wohnsignal.de
//   ABSENDER           verifizierter absender, z. B. anfragen@wohnsignal.de
//                      (bis zur domain-verifizierung: onboarding@resend.dev)
//   ERLAUBTE_ORIGINS   kommagetrennt, z. B.
//                      https://marcelgaertner1234.github.io,https://wohnsignal.de
//   IP_PEPPER          zufaelliger string fuer ip-hashing (datensparsamkeit)
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt supabase automatisch bereit.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_PRO_STUNDE = 5;

function corsHeaders(origin: string): Record<string, string> {
  const erlaubt = (Deno.env.get("ERLAUBTE_ORIGINS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const ok = erlaubt.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json",
  };
}

async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const pepper = Deno.env.get("IP_PEPPER") ?? "";
  const data = new TextEncoder().encode(ip + pepper);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, fehler: "nur POST" }), { status: 405, headers });
  }

  let daten: Record<string, unknown>;
  try {
    daten = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, fehler: "kein json" }), { status: 400, headers });
  }

  // honeypot: das feld «webseite» ist im formular unsichtbar — bots fuellen es
  if (typeof daten.webseite === "string" && daten.webseite.trim() !== "") {
    // bot leise akzeptieren, nichts speichern
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  const name = String(daten.name ?? "").trim();
  const email = String(daten.email ?? "").trim();
  const nachricht = String(daten.nachricht ?? "").trim();
  const inseratId = String(daten.inseratId ?? "").trim();
  const inseratTitel = String(daten.inseratTitel ?? "").trim().slice(0, 200);

  if (name.length < 2 || name.length > 120 || !email.includes("@") || email.length > 200 ||
      nachricht.length < 10 || nachricht.length > 4000 || inseratId.length === 0) {
    return new Response(JSON.stringify({ ok: false, fehler: "eingaben unvollstaendig" }), { status: 422, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // rate-limit: max N anfragen pro stunde je ip-hash
  const hash = await ipHash(req);
  const vorEinerStunde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("anfragen")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", hash)
    .gte("created_at", vorEinerStunde);
  if ((count ?? 0) >= MAX_PRO_STUNDE) {
    return new Response(JSON.stringify({ ok: false, fehler: "zu viele anfragen — bitte spaeter erneut" }), { status: 429, headers });
  }

  const { error: dbFehler } = await supabase.from("anfragen").insert({
    inserat_id: inseratId,
    inserat_titel: inseratTitel,
    name, email, nachricht,
    ip_hash: hash,
  });
  if (dbFehler) {
    console.error("db:", dbFehler.message);
    return new Response(JSON.stringify({ ok: false, fehler: "speichern fehlgeschlagen" }), { status: 500, headers });
  }

  // mail an das portal-postfach, antwort geht direkt an die interessentin
  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `wohnsignal <${Deno.env.get("ABSENDER") ?? "onboarding@resend.dev"}>`,
      to: [Deno.env.get("PORTAL_EMPFANG")],
      reply_to: email,
      subject: `Anfrage: ${inseratTitel || inseratId}`,
      text: [
        `Neue Anfrage über wohnsignal`,
        ``,
        `Inserat:  ${inseratTitel} (${inseratId})`,
        `Name:     ${name}`,
        `E-Mail:   ${email}`,
        ``,
        `Nachricht:`,
        nachricht,
      ].join("\n"),
    }),
  });
  if (!mail.ok) {
    console.error("resend:", mail.status, await mail.text());
    // anfrage ist gespeichert — dem nutzer trotzdem erfolg melden, admin sieht sie in der db
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
});
