-- XTC — Polo limited-edition numbers (1..50)
-- Run this once in the Supabase SQL editor (project: mugifniadilfwfgrsvie).
--
-- Every polo unit purchased (any colour) is assigned a unique edition number
-- from 1 to 50. A number is claimed exactly once and is NEVER reused — even if
-- an order is re-submitted. Allocation is atomic and concurrency-safe via
-- `for update skip locked`, so two simultaneous buyers can never get the same
-- number. All access is server-side only (service-role key in server.js).

create table if not exists public.polo_editions (
  number      int primary key check (number between 1 and 50),
  order_id    text,                 -- the order that claimed this number (null = free)
  email       text,
  assigned_at timestamptz
);

-- Seed numbers 1..50 (no-op if already seeded).
insert into public.polo_editions (number)
select g from generate_series(1, 50) g
on conflict (number) do nothing;

-- Record each order's assigned numbers on the order row itself.
alter table public.orders add column if not exists polo_numbers int[] default '{}';

alter table public.polo_editions enable row level security;
-- Intentionally no policies: access is via the service-role key in server.js only.

-- Atomically claim `p_count` free numbers for an order.
-- Idempotent: if this order already holds numbers, they are returned unchanged
-- (and topped up only if more polo units were added). Returns the full set of
-- numbers held by the order, or an empty array if the edition is sold out.
create or replace function public.claim_polo_numbers(p_order_id text, p_email text, p_count int)
returns int[]
language plpgsql
as $$
declare
  existing int[];
  need     int;
  claimed  int[];
begin
  select array_agg(number order by number) into existing
  from public.polo_editions
  where order_id = p_order_id;

  need := greatest(0, coalesce(p_count, 0) - coalesce(array_length(existing, 1), 0));

  if need = 0 then
    return coalesce(existing, '{}');
  end if;

  with free as (
    select number
    from public.polo_editions
    where order_id is null
    order by number
    limit need
    for update skip locked
  ),
  upd as (
    update public.polo_editions e
    set order_id = p_order_id, email = p_email, assigned_at = now()
    from free
    where e.number = free.number
    returning e.number
  )
  select array_agg(number order by number) into claimed from upd;

  return coalesce(existing, '{}') || coalesce(claimed, '{}');
end;
$$;
