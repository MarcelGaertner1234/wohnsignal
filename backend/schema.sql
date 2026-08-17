-- wohnsignal — supabase-schema (phase 2)
-- einspielen im supabase sql-editor (einmalig, idempotent — gefahrlos wiederholbar).
-- KEINE geheimnisse in dieser datei — sie liegt bewusst im oeffentlichen repo.

-- funktions-koerper erst zur laufzeit pruefen (sonst scheitert eine funktion,
-- die eine weiter unten definierte tabelle erwaehnt, schon beim anlegen)
set check_function_bodies = off;

-- ------------------------------------------------------------------
-- 1. profile — 1:1 zu auth.users, wird per trigger angelegt
--    (tabelle ZUERST: die helfer-funktion ist_admin referenziert sie)
-- ------------------------------------------------------------------
create table if not exists public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  rolle text not null default 'inserent' check (rolle in ('inserent', 'admin')),
  created_at timestamptz not null default now()
);

-- helfer: ist der angemeldete nutzer admin?
-- security definer bricht die rls-rekursion auf profile.
create or replace function public.ist_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile
    where id = auth.uid() and rolle = 'admin'
  );
$$;

alter table public.profile enable row level security;

drop policy if exists "profil: eigenes lesen" on public.profile;
create policy "profil: eigenes lesen" on public.profile
  for select using (auth.uid() = id or public.ist_admin());

drop policy if exists "profil: eigenes aendern" on public.profile;
create policy "profil: eigenes aendern" on public.profile
  for update using (auth.uid() = id)
  with check (auth.uid() = id and rolle = (select rolle from public.profile where id = auth.uid()));
  -- rollen-wechsel geht nur ueber sql/service_role, nie ueber den client

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profile (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------
-- 2. inserate — mit moderations-gate:
--    inserenten reichen ein («eingereicht»), NUR admin setzt «aktiv».
-- ------------------------------------------------------------------
create table if not exists public.inserate (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  status text not null default 'entwurf'
    check (status in ('entwurf', 'eingereicht', 'aktiv', 'pausiert', 'abgelehnt', 'archiviert')),
  titel text not null check (char_length(titel) between 5 and 120),
  typ text not null check (typ in ('wohnung', 'studio', 'loft', 'penthouse', 'haus')),
  angebot text not null check (angebot in ('miete', 'kauf')),
  ort text not null,
  kreis text not null,
  plz text not null check (plz ~ '^[0-9]{5}$'),
  strasse text not null,
  preis_eur integer not null check (preis_eur between 1 and 100000000),
  zimmer numeric(3, 1) not null check (zimmer between 1 and 20),
  flaeche_m2 integer not null check (flaeche_m2 between 5 and 5000),
  etage text not null default '',
  verfuegbar_ab text not null default 'nach Vereinbarung',
  merkmale text[] not null default '{}',
  beschreibung text not null default '' check (char_length(beschreibung) <= 4000),
  fotos jsonb not null default '[]'::jsonb,
  moderations_notiz text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inserate_status_idx on public.inserate (status);
create index if not exists inserate_owner_idx on public.inserate (owner);

alter table public.inserate enable row level security;

-- lesen: aktive fuer alle (auch anonym), eigene fuer den owner, alles fuer admin
drop policy if exists "inserate: aktive oeffentlich" on public.inserate;
create policy "inserate: aktive oeffentlich" on public.inserate
  for select using (status = 'aktiv' or owner = auth.uid() or public.ist_admin());

-- anlegen: nur eingeloggt, nur als eigener entwurf/einreichung — NIE direkt aktiv
drop policy if exists "inserate: eigene anlegen" on public.inserate;
create policy "inserate: eigene anlegen" on public.inserate
  for insert with check (
    owner = auth.uid() and status in ('entwurf', 'eingereicht')
  );

-- aendern: owner nur eigene und nur in nicht-freigegebene status;
-- statuswechsel auf «aktiv» kann ausschliesslich der admin
drop policy if exists "inserate: eigene aendern" on public.inserate;
create policy "inserate: eigene aendern" on public.inserate
  for update using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and status in ('entwurf', 'eingereicht', 'pausiert', 'archiviert')
  );

drop policy if exists "inserate: admin verwaltet" on public.inserate;
create policy "inserate: admin verwaltet" on public.inserate
  for update using (public.ist_admin()) with check (true);

drop policy if exists "inserate: eigene entwuerfe loeschen" on public.inserate;
create policy "inserate: eigene entwuerfe loeschen" on public.inserate
  for delete using (
    (owner = auth.uid() and status in ('entwurf', 'abgelehnt', 'archiviert'))
    or public.ist_admin()
  );

create or replace function public.setze_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inserate_updated_at on public.inserate;
create trigger inserate_updated_at
  before update on public.inserate
  for each row execute function public.setze_updated_at();

-- ------------------------------------------------------------------
-- 3. anfragen — wird NUR von der edge function (service_role) beschrieben.
--    kein anon-insert: honeypot + rate-limit laufen in der function.
--    inserat_id ist text, damit die uebergangszeit auch demo-ids traegt.
-- ------------------------------------------------------------------
create table if not exists public.anfragen (
  id uuid primary key default gen_random_uuid(),
  inserat_id text not null,
  inserat_titel text not null default '',
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (position('@' in email) > 1),
  nachricht text not null check (char_length(nachricht) between 10 and 4000),
  ip_hash text not null default '',
  status text not null default 'neu' check (status in ('neu', 'beantwortet', 'spam')),
  created_at timestamptz not null default now()
);

create index if not exists anfragen_created_idx on public.anfragen (created_at);
create index if not exists anfragen_iphash_idx on public.anfragen (ip_hash, created_at);

alter table public.anfragen enable row level security;

-- bewusst KEINE anon/auth-schreibrechte; nur admin liest und pflegt status
drop policy if exists "anfragen: admin liest" on public.anfragen;
create policy "anfragen: admin liest" on public.anfragen
  for select using (public.ist_admin());

drop policy if exists "anfragen: admin aendert" on public.anfragen;
create policy "anfragen: admin aendert" on public.anfragen
  for update using (public.ist_admin()) with check (public.ist_admin());

-- ------------------------------------------------------------------
-- 4. explizite privilegien — noetig, weil beim projekt-setup
--    «automatically expose new tables» bewusst deaktiviert ist
--    (least privilege; harmlos-redundant, falls es doch aktiv ist).
--    die eigentliche zugriffskontrolle bleibt RLS.
-- ------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant execute on function public.ist_admin() to anon, authenticated;

grant select on public.inserate to anon, authenticated;
grant insert, update, delete on public.inserate to authenticated;

grant select, update on public.profile to authenticated;

-- anfragen: anon/authenticated koennen NICHT einfuegen (nur die edge function
-- via service_role); admin liest/pflegt ueber authenticated + RLS.
grant select, update on public.anfragen to authenticated;

-- ------------------------------------------------------------------
-- 5. nach dem einspielen (manuell im sql-editor):
--    marcel zum admin machen, SOBALD er sich einmal angemeldet hat:
--    update public.profile set rolle = 'admin'
--    where id = (select id from auth.users where email = 'kontakt@wohnsignal.de');
-- ------------------------------------------------------------------
