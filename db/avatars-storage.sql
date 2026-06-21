-- XTC — avatars storage bucket (profile photos)
-- Run this once in the Supabase SQL editor (project: mugifniadilfwfgrsvie).
--
-- Profile photos are uploaded client-side by the signed-in user to
-- avatars/<user_id>/avatar.jpg and served from a public URL. The public URL is
-- stored in the user's auth metadata (avatar_url), so it syncs across devices.

-- 1) Public bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 2) Row Level Security policies on storage.objects for the avatars bucket.
--    Anyone can read; each user may only write within their own <uid>/ folder.

drop policy if exists "Avatar public read" on storage.objects;
create policy "Avatar public read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

drop policy if exists "Avatar insert own" on storage.objects;
create policy "Avatar insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatar update own" on storage.objects;
create policy "Avatar update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatar delete own" on storage.objects;
create policy "Avatar delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
