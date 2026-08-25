alter table public.rooms
add column receipt_header jsonb not null default '[]'::jsonb;