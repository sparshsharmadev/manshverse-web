-- Persistent, owner-scoped artifact library.
create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  kind text not null check (kind in ('website', 'document')),
  content text not null default '',
  files jsonb not null default '{}'::jsonb check (jsonb_typeof(files) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artifacts_owner_updated_idx
  on public.artifacts (user_id, updated_at desc);

create table if not exists public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('website', 'document')),
  content text not null default '',
  files jsonb not null default '{}'::jsonb check (jsonb_typeof(files) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists artifact_versions_artifact_created_idx
  on public.artifact_versions (artifact_id, created_at desc);

alter table public.artifacts enable row level security;
alter table public.artifact_versions enable row level security;
revoke all on table public.artifacts from anon;
grant select, insert, update, delete on table public.artifacts to authenticated;
revoke all on table public.artifact_versions from anon;
grant select on table public.artifact_versions to authenticated;

drop policy if exists "owners manage their artifacts" on public.artifacts;
create policy "owners manage their artifacts" on public.artifacts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owners read artifact versions" on public.artifact_versions;
create policy "owners read artifact versions" on public.artifact_versions
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.set_artifact_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = old.user_id then
    insert into public.artifact_versions(artifact_id, user_id, title, kind, content, files)
    values (old.id, old.user_id, old.title, old.kind, old.content, old.files);
  end if;
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists artifacts_updated_at on public.artifacts;
create trigger artifacts_updated_at
  before update on public.artifacts
  for each row execute function public.set_artifact_updated_at();
