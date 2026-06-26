-- XTC — persistent orders table
-- Run this once in the Supabase SQL editor (project: mugifniadilfwfgrsvie).
--
-- Orders are read/written only by the server (server.js) using the service-role
-- key, which bypasses Row Level Security. RLS is enabled with no policies so no
-- client (anon/authenticated) can read orders directly — the server authorises
-- each request by verifying the user's Supabase access token.

create table if not exists public.orders (
  id              text primary key,                 -- order ref, e.g. XTC123456
  user_id         uuid,                             -- linked Supabase auth user (nullable for guest)
  email           text,                             -- customer email (join key across devices)
  items           jsonb       default '[]'::jsonb,  -- line items
  total           numeric,                          -- order total in GBP
  currency        text        default 'gbp',
  status          text        default 'Processing',
  source            text        default 'custom',   -- 'custom' | 'stripe'
  redeemed_points   numeric     default 0,          -- loyalty points spent on this order
  stock_decremented boolean     default false,      -- guards one-time stock decrement
  carrier           text,                           -- shipping carrier (admin-set)
  tracking_number   text,                           -- tracking number (admin-set)
  phone             text,                           -- customer phone
  country           text,                           -- shipping country code (e.g. GB)
  name              text,                           -- customer full name
  address           text,                           -- street address
  city              text,                           -- city
  postcode          text,                           -- postcode / ZIP
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- If the table already exists from an earlier version, add the new columns:
alter table public.orders add column if not exists redeemed_points   numeric default 0;
alter table public.orders add column if not exists stock_decremented boolean default false;
alter table public.orders add column if not exists carrier           text;
alter table public.orders add column if not exists tracking_number   text;
alter table public.orders add column if not exists updated_at        timestamptz default now();
alter table public.orders add column if not exists phone             text;
alter table public.orders add column if not exists country           text;
alter table public.orders add column if not exists name              text;
alter table public.orders add column if not exists address           text;
alter table public.orders add column if not exists city              text;
alter table public.orders add column if not exists postcode          text;

create index if not exists orders_email_idx   on public.orders (lower(email));
create index if not exists orders_user_id_idx on public.orders (user_id);

alter table public.orders enable row level security;
-- Intentionally no policies: access is via the service-role key in server.js only.
