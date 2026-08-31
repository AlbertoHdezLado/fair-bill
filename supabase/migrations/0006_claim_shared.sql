-- Un grupo puede ser privado ("para mí") o abierto a que otros se unan
-- ("compartido"); hasta ahora no se distinguían y un grupo de una persona
-- podía ser cualquiera de los dos.

alter table public.claims
  add column if not exists shared boolean not null default false;

alter table public.claims
  add column if not exists all_participants boolean not null default false;

-- Los grupos existentes con más de un miembro solo pueden ser compartidos.
update public.claims
set shared = true
where coalesce(array_length(group_ids, 1), 0) > 1;
