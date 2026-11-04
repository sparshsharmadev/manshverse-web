-- Manshverse fresh Supabase schema. This creates new tables and does not import
-- or delete anything from Firebase.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_created_idx on public.conversations(user_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

create table if not exists public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_requests_created_idx on public.plan_requests(created_at desc);

create table if not exists public.app_settings (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, data) values ('platform', '{}'::jsonb) on conflict (key) do nothing;

create or replace function public.is_manshverse_admin()
returns boolean language sql stable
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' $$;

create or replace function public.delete_manshverse_user(target_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manshverse_admin() then
    raise exception 'Only Manshverse admins can delete accounts';
  end if;
  delete from auth.users where id = target_user;
end;
$$;
revoke all on function public.delete_manshverse_user(uuid) from public;
grant execute on function public.delete_manshverse_user(uuid) to authenticated;

create or replace function public.create_manshverse_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, data)
  values (
    new.id,
    jsonb_build_object(
      'name', coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'User'),
      'email', coalesce(new.email, ''),
      'photoURL', coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', ''),
      'onboardingCompleted', false,
      'plan', 'free', 'planExpiry', null,
      'createdAt', now(), 'updatedAt', now()
    )
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_manshverse on auth.users;
create trigger on_auth_user_created_manshverse after insert on auth.users
for each row execute procedure public.create_manshverse_profile();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.daily_usage enable row level security;
alter table public.plan_requests enable row level security;
alter table public.app_settings enable row level security;

create policy "profile owner or admin access" on public.profiles for all to authenticated
using (id = (select auth.uid()) or public.is_manshverse_admin())
with check (id = (select auth.uid()) or public.is_manshverse_admin());
create policy "conversation owner or admin access" on public.conversations for all to authenticated
using (user_id = (select auth.uid()) or public.is_manshverse_admin())
with check (user_id = (select auth.uid()) or public.is_manshverse_admin());
create policy "message owner or admin access" on public.messages for all to authenticated
using ((user_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))) or public.is_manshverse_admin())
with check ((user_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))) or public.is_manshverse_admin());
create policy "usage owner or admin access" on public.daily_usage for all to authenticated
using (user_id = (select auth.uid()) or public.is_manshverse_admin())
with check (user_id = (select auth.uid()) or public.is_manshverse_admin());
create policy "requests owner or admin access" on public.plan_requests for all to authenticated
using (user_id = (select auth.uid()) or public.is_manshverse_admin())
with check (user_id = (select auth.uid()) or public.is_manshverse_admin());
create policy "public app can read settings" on public.app_settings for select to anon, authenticated using (true);
create policy "admins manage settings" on public.app_settings for all to authenticated
using (public.is_manshverse_admin()) with check (public.is_manshverse_admin());

-- Enable Realtime for tables watched by the client.
do $$ begin
  alter publication supabase_realtime add table public.profiles;
  alter publication supabase_realtime add table public.app_settings;
  alter publication supabase_realtime add table public.daily_usage;
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on public.profiles, public.conversations,
  public.messages, public.daily_usage, public.plan_requests, public.app_settings
to authenticated;

grant select on public.app_settings to anon;
