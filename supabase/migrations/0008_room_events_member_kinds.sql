-- Distingue quien entra/sale de un grupo ya existente en vez de reportarlo
-- como un cambio genérico de número de personas.

alter table public.room_events
  drop constraint if exists room_events_kind_check;

alter table public.room_events
  add constraint room_events_kind_check
  check (kind in ('group_changed', 'group_removed', 'member_joined', 'member_left'));
