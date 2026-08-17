-- wohnsignal — storage fuer inserat-fotos (phase 2, P2-4)
-- bucket ist oeffentlich LESBAR (fotos aktiver inserate gehoeren ins portal);
-- SCHREIBEN darf nur der angemeldete inserent, und nur in seinen eigenen
-- ordner (<auth.uid>/<inserat-id>/...). limits: 5 MB, nur bildformate.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inserat-fotos', 'inserat-fotos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inserat-fotos: owner laedt in eigenen ordner" on storage.objects;
create policy "inserat-fotos: owner laedt in eigenen ordner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inserat-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "inserat-fotos: owner loescht eigene" on storage.objects;
create policy "inserat-fotos: owner loescht eigene" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inserat-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "inserat-fotos: oeffentlich lesbar" on storage.objects;
create policy "inserat-fotos: oeffentlich lesbar" on storage.objects
  for select to public
  using (bucket_id = 'inserat-fotos');
