-- XTC — persistent orders table
-- Run this once in the Supabase SQL editor (project: mugifniadilfwfgrsvie).
--
-- Orders are read/written only by the server (server.js) using the service-role
-- key, which bypasses Row Level Security. RLS is enabled with no policies so no
-- client (anon/authenticated) can read orders directly — the server authorises
-- each request by verifying the user's Supabase access token.

create table if not exists public.orders (
  id          text primary key,                 -- order ref, e.g. XTC123456
  user_id     uuid,                              -- linked Supabase auth user (nullable for guest)
  email       text,                              -- customer email (join key across devices)
  items       jsonb       default '[]'::jsonb,   -- line items
  total       numeric,                           -- order total in GBP
  currency    text        default 'gbp',
  status      text        default 'Processing',
  source      text        default 'custom',      -- 'custom' | 'stripe'
  created_at  timestamptz default now()
);

create index if not exists orders_email_idx   on public.orders (lower(email));
create index if not exists orders_user_id_idx on public.orders (user_id);

alter table public.orders enable row level security;
-- Intentionally no policies: access is via the service-role key in server.js only.
