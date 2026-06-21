-- =====================================================================
-- XTC CLOTHING — full Supabase setup
-- Run this whole file once in the Supabase SQL editor
-- (project: mugifniadilfwfgrsvie). Safe to re-run (idempotent).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1) STOCK  (read/written by the server via the service-role key; the
--    site reads it through the /stock endpoint, never directly)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.stock (
  product_id text primary key,
  sizes      jsonb       default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.stock enable row level security;
-- No policies: access is via the service-role key in server.js only.

-- Seed starting stock (matches js/stock.js defaults — adjust quantities freely)
insert into public.stock (product_id, sizes) values
  ('polo-black', '{"S":0,"M":0,"L":6,"XL":0,"XXL":0}'::jsonb),
  ('polo-white', '{"S":0,"M":2,"L":8,"XL":0,"XXL":0}'::jsonb)
on conflict (product_id) do nothing;


-- ─────────────────────────────────────────────────────────────────────
-- 2) PROFILES  (read/written by the signed-in user from the browser,
--    so RLS limits each user to their OWN row)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  points     numeric default 0,
  since      integer,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles select own" on public.profiles;
create policy "Profiles select own" on public.profiles
  for select to authenticated using ( id = auth.uid() );

drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own" on public.profiles
  for insert to authenticated with check ( id = auth.uid() );

drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own" on public.profiles
  for update to authenticated using ( id = auth.uid() ) with check ( id = auth.uid() );


-- ─────────────────────────────────────────────────────────────────────
-- 3) ORDERS  (read/written by the server via the service-role key, which
--    bypasses RLS; the server authorises each request by verifying the
--    user's access token, so the table has RLS on with no policies)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                text primary key,                 -- order ref, e.g. XTC123456
  user_id           uuid,                             -- linked auth user (nullable for guest)
  email             text,                             -- customer email (join key across devices)
  items             jsonb       default '[]'::jsonb,  -- line items
  total             numeric,                          -- order total in GBP
  currency          text        default 'gbp',
  status            text        default 'Processing',
  source            text        default 'custom',     -- 'custom' | 'stripe'
  redeemed_points   numeric     default 0,            -- loyalty points spent on this order
  stock_decremented boolean     default false,        -- guards one-time stock decrement
  carrier           text,                             -- shipping carrier (admin-set)
  tracking_number   text,                             -- tracking number (admin-set)
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- If the table already exists from an earlier version, add the newer columns:
alter table public.orders add column if not exists redeemed_points   numeric default 0;
alter table public.orders add column if not exists stock_decremented boolean default false;
alter table public.orders add column if not exists carrier           text;
alter table public.orders add column if not exists tracking_number   text;
alter table public.orders add column if not exists updated_at        timestamptz default now();

create index if not exists orders_email_idx   on public.orders (lower(email));
create index if not exists orders_user_id_idx on public.orders (user_id);

alter table public.orders enable row level security;
-- Intentionally no policies: access is via the service-role key in server.js only.


-- ─────────────────────────────────────────────────────────────────────
-- 4) AVATARS storage bucket  (profile photos)
--    Public read; each user may only write within their own <uid>/ folder.
-- ─────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar public read" on storage.objects;
create policy "Avatar public read" on storage.objects
  for select using ( bucket_id = 'avatars' );

drop policy if exists "Avatar insert own" on storage.objects;
create policy "Avatar insert own" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "Avatar update own" on storage.objects;
create policy "Avatar update own" on storage.objects
  for update to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "Avatar delete own" on storage.objects;
create policy "Avatar delete own" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
