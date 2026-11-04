-- Lock down client-writable account and quota fields while keeping profile
-- preferences and admin-managed account operations available.

create or replace function public.protect_manshverse_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_key text;
begin
  -- Auth creates profiles from a trusted database trigger with no request JWT.
  if auth.uid() is null or public.is_manshverse_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id <> auth.uid() then
      raise exception 'Cannot create another user profile';
    end if;
    if coalesce(new.data ->> 'plan', 'free') <> 'free'
      or coalesce((new.data ->> 'isBanned')::boolean, false)
      or (new.data ? 'planExpiry' and new.data -> 'planExpiry' <> 'null'::jsonb)
      or nullif(new.data ->> 'planGrantedAt', '') is not null
      or nullif(new.data ->> 'planGrantedBy', '') is not null
      or nullif(new.data ->> 'planSource', '') is not null
      or nullif(new.data ->> 'lastApprovedRequestId', '') is not null then
      raise exception 'Account access fields are admin managed';
    end if;
    return new;
  end if;

  foreach protected_key in array array[
    'plan', 'planExpiry', 'planGrantedAt', 'planGrantedBy', 'planSource',
    'isBanned', 'lastApprovedRequestId'
  ] loop
    if (new.data -> protected_key) is distinct from (old.data -> protected_key) then
      raise exception 'Account access fields are admin managed';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists protect_manshverse_profile_fields on public.profiles;
create trigger protect_manshverse_profile_fields
before insert or update of data on public.profiles
for each row execute function public.protect_manshverse_profile();

drop policy if exists "profile owner or admin access" on public.profiles;
create policy "profiles owner or admin read" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_manshverse_admin());
create policy "profiles owner or admin insert" on public.profiles
for insert to authenticated
with check (id = (select auth.uid()) or public.is_manshverse_admin());
create policy "profiles owner or admin update" on public.profiles
for update to authenticated
using (id = (select auth.uid()) or public.is_manshverse_admin())
with check (id = (select auth.uid()) or public.is_manshverse_admin());
create policy "profiles admin delete" on public.profiles
for delete to authenticated
using (public.is_manshverse_admin());

-- Clients may read their own counters, but only the quota RPC and admins can
-- mutate them. This prevents resetting or forging daily usage from DevTools.
drop policy if exists "usage owner or admin access" on public.daily_usage;
create policy "usage owner or admin read" on public.daily_usage
for select to authenticated
using (user_id = (select auth.uid()) or public.is_manshverse_admin());
create policy "usage admin manage" on public.daily_usage
for all to authenticated
using (public.is_manshverse_admin())
with check (public.is_manshverse_admin());

create or replace function public.protect_manshverse_plan_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_manshverse_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() or coalesce(new.data ->> 'status', 'pending') <> 'pending'
      or nullif(new.data ->> 'approvedPlan', '') is not null
      or nullif(new.data ->> 'handledBy', '') is not null then
      raise exception 'Plan decisions are admin managed';
    end if;
  elsif (new.data -> 'status') is distinct from (old.data -> 'status')
    or (new.data -> 'approvedPlan') is distinct from (old.data -> 'approvedPlan')
    or (new.data -> 'handledAt') is distinct from (old.data -> 'handledAt')
    or (new.data -> 'handledBy') is distinct from (old.data -> 'handledBy') then
    raise exception 'Plan decisions are admin managed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_manshverse_plan_request_fields on public.plan_requests;
create trigger protect_manshverse_plan_request_fields
before insert or update of data on public.plan_requests
for each row execute function public.protect_manshverse_plan_request();

-- Atomically reserve one daily model request. The model key is supplied by the
-- trusted API proxy, after it maps the provider model to a fixed app model.
create or replace function public.consume_manshverse_usage(p_model_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_profile jsonb;
  v_settings jsonb;
  v_plan text;
  v_expiry timestamptz;
  v_limit_json jsonb;
  v_limit integer;
  v_used integer;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  end if;
  if p_model_key not in ('qwen/qwen3-32b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct', 'moonshotai/kimi-k2-instruct-0905', 'openai/gpt-oss-20b') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_model');
  end if;
  if public.is_manshverse_admin() then
    return jsonb_build_object('allowed', true, 'admin', true);
  end if;

  select p.data into v_profile from public.profiles p where p.id = v_user;
  select s.data into v_settings from public.app_settings s where s.key = 'platform';
  if coalesce((v_profile ->> 'isBanned')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'banned');
  end if;
  if coalesce((v_settings ->> 'maintenanceMode')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'maintenance');
  end if;

  v_plan := coalesce(v_profile ->> 'plan', 'free');
  v_expiry := nullif(v_profile ->> 'planExpiry', '')::timestamptz;
  if v_plan not in ('free', 'pro', 'ultra') or (v_expiry is not null and v_expiry <= now()) then
    v_plan := 'free';
  end if;

  v_limit_json := v_settings #> array['planLimits', v_plan, p_model_key];
  if v_limit_json is null or v_limit_json = '""'::jsonb then
    v_limit := case v_plan
      when 'pro' then case p_model_key when 'qwen/qwen3-32b' then 30 when 'openai/gpt-oss-120b' then 75 when 'llama-3.3-70b-versatile' then 300 when 'meta-llama/llama-4-scout-17b-16e-instruct' then 50 when 'moonshotai/kimi-k2-instruct-0905' then 75 else 500 end
      when 'ultra' then null
      else case p_model_key when 'qwen/qwen3-32b' then 3 when 'openai/gpt-oss-120b' then 10 when 'llama-3.3-70b-versatile' then 30 when 'meta-llama/llama-4-scout-17b-16e-instruct' then 5 when 'moonshotai/kimi-k2-instruct-0905' then 10 else 50 end
    end;
  elsif v_limit_json = 'null'::jsonb or lower(trim(both '"' from v_limit_json::text)) in ('inf', 'infinity', 'unlimited', '∞') then
    v_limit := null;
  elsif jsonb_typeof(v_limit_json) = 'number' and (v_limit_json #>> '{}') ~ '^\d+$' then
    v_limit := (v_limit_json #>> '{}')::integer;
  elsif jsonb_typeof(v_limit_json) = 'string' and (v_limit_json #>> '{}') ~ '^\d+$' then
    v_limit := (v_limit_json #>> '{}')::integer;
  else
    v_limit := case v_plan
      when 'pro' then case p_model_key when 'qwen/qwen3-32b' then 30 when 'openai/gpt-oss-120b' then 75 when 'llama-3.3-70b-versatile' then 300 when 'meta-llama/llama-4-scout-17b-16e-instruct' then 50 when 'moonshotai/kimi-k2-instruct-0905' then 75 else 500 end
      when 'ultra' then null
      else case p_model_key when 'qwen/qwen3-32b' then 3 when 'openai/gpt-oss-120b' then 10 when 'llama-3.3-70b-versatile' then 30 when 'meta-llama/llama-4-scout-17b-16e-instruct' then 5 when 'moonshotai/kimi-k2-instruct-0905' then 10 else 50 end
    end;
  end if;

  insert into public.daily_usage(user_id, day, data)
  values (v_user, v_day, '{}'::jsonb)
  on conflict (user_id, day) do nothing;
  select coalesce(nullif(u.data ->> p_model_key, '')::integer, 0)
    into v_used from public.daily_usage u
    where u.user_id = v_user and u.day = v_day for update;
  if v_limit is not null and v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit', 'used', v_used, 'limit', v_limit);
  end if;

  update public.daily_usage
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(p_model_key, v_used + 1), updated_at = now()
    where user_id = v_user and day = v_day;
  return jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_manshverse_usage(text) from public, anon;
grant execute on function public.consume_manshverse_usage(text) to authenticated;

create or replace function public.release_manshverse_usage(p_model_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_used integer;
begin
  if v_user is null or public.is_manshverse_admin()
    or p_model_key not in ('qwen/qwen3-32b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct', 'moonshotai/kimi-k2-instruct-0905', 'openai/gpt-oss-20b') then
    return;
  end if;
  select coalesce(nullif(u.data ->> p_model_key, '')::integer, 0)
    into v_used from public.daily_usage u
    where u.user_id = v_user and u.day = v_day for update;
  if coalesce(v_used, 0) > 0 then
    update public.daily_usage
      set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(p_model_key, v_used - 1), updated_at = now()
      where user_id = v_user and day = v_day;
  end if;
end;
$$;

revoke all on function public.release_manshverse_usage(text) from public, anon;
grant execute on function public.release_manshverse_usage(text) to authenticated;
