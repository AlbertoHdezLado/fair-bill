-- fairBill room storage. Rooms are ephemeral: they hold no accounts, just a
-- 6-character code, the scanned bill and who claimed what. A room is deleted
-- a month after its last activity.
--
-- Security model: RLS is on with no policies at all, so the anon key cannot
-- read or write any of these tables. Every access goes through the Next.js
-- route handlers with the service role key, which validate the room code
-- first. Live updates are pushed as Realtime broadcasts from those handlers,
-- so clients never need direct table access.

create extension if not exists pg_cron;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null unique,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  tax_cents integer not null default 0,
  tip_cents integer not null default 0,
  service_cents integer not null default 0,
  discount_cents integer not null default 0,
  detected_total_cents integer
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, name)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null default '',
  quantity numeric(10, 2) not null default 0,
  unit_price_cents integer not null default 0,
  edited boolean not null default false,
  position integer not null default 0
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  -- The participant this share belongs to.
  participant_id uuid not null references public.participants (id) on delete cascade,
  -- Who created the choice: a shared choice is copied to every member of the
  -- group, but only its author may edit or remove it.
  owner_id uuid not null references public.participants (id) on delete cascade,
  -- Total units the whole group takes, not this person's fraction.
  units numeric(10, 2) not null default 0,
  group_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (item_id, participant_id, owner_id)
);

create index items_room_id_idx on public.items (room_id);
create index claims_room_id_idx on public.claims (room_id);
create index participants_room_id_idx on public.participants (room_id);
create index rooms_last_activity_at_idx on public.rooms (last_activity_at);

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;

-- Any write anywhere in the room keeps the whole room alive.
create function public.touch_room() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rooms
  set last_activity_at = now()
  where id = coalesce(new.room_id, old.room_id);
  return coalesce(new, old);
end;
$$;

create trigger participants_touch_room
after insert or update or delete on public.participants
for each row execute function public.touch_room();

create trigger items_touch_room
after insert or update or delete on public.items
for each row execute function public.touch_room();

create trigger claims_touch_room
after insert or update or delete on public.claims
for each row execute function public.touch_room();

create function public.delete_stale_rooms() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rooms where last_activity_at < now() - interval '1 month';
$$;

select cron.schedule(
  'fairbill-delete-stale-rooms',
  '0 4 * * *',
  $$select public.delete_stale_rooms()$$
);
