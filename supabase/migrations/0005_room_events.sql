-- Historial persistente de cambios de reparto para poder mostrar avisos
-- aunque alguien no estuviera conectado en tiempo real.

create table if not exists public.room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  kind text not null check (kind in ('group_changed', 'group_removed')),
  actor_id uuid references public.participants (id) on delete set null,
  item_name text not null default '',
  units numeric(10, 2),
  people_count integer,
  created_at timestamptz not null default now()
);

create index if not exists room_events_room_id_created_at_idx
  on public.room_events (room_id, created_at desc);

alter table public.room_events enable row level security;

drop trigger if exists room_events_touch_room on public.room_events;
create trigger room_events_touch_room
after insert or update or delete on public.room_events
for each row execute function public.touch_room();
