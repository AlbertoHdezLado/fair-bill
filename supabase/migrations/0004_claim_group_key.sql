-- Una persona puede tener varios grupos sobre la misma línea (los suyos en
-- solitario y los que comparte), así que la identidad de un grupo deja de ser
-- su autor y pasa a ser una clave propia.

alter table public.claims
  add column if not exists group_key uuid;

-- Los grupos existentes se identificaban por (línea, autor).
update public.claims
set group_key = md5(item_id::text || owner_id::text)::uuid
where group_key is null;

alter table public.claims
  alter column group_key set default gen_random_uuid(),
  alter column group_key set not null;

alter table public.claims
  drop constraint if exists claims_item_id_participant_id_owner_id_key;

alter table public.claims
  add constraint claims_item_participant_group_key
  unique (item_id, participant_id, group_key);
