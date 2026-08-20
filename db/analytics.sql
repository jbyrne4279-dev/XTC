-- XTC — on-site analytics events table
-- Run this once in the Supabase SQL editor (project: mugifniadilfwfgrsvie).
--
-- Written only by the server (server.js POST /analytics/event, using the
-- service-role key). RLS is enabled with no policies, so no client
-- (anon/authenticated) can read or write this table directly.

create table if not exists public.analytics_events (
  id          bigserial primary key,
  session_id  text        not null,   -- random id, one per browser session (sessionStorage)
  event_type  text        not null,   -- session_start | pageview | pageview_end | add_to_cart | begin_checkout | purchase | sign_up | error
  path        text,                   -- location.pathname
  referrer    text,
  meta        jsonb       default '{}'::jsonb,  -- duration (ms), value, currency, error message/stack, etc.
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_session_idx  on public.analytics_events (session_id);
create index if not exists analytics_events_type_idx     on public.analytics_events (event_type);
create index if not exists analytics_events_created_idx  on public.analytics_events (created_at);

alter table public.analytics_events enable row level security;
