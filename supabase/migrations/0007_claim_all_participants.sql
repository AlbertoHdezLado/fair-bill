-- A group created for the whole room grows as new participants join.
alter table public.claims
  add column if not exists all_participants boolean not null default false;