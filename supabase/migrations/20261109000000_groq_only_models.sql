-- Move model quotas to Groq IDs and remove OpenRouter-only choices.
do $$
declare
  plan_name text;
  model_key text;
  new_key text;
  mapping record;
  fallback_limit jsonb;
  function_definition text;
  obsolete_keys text[] := array[
    'openrouter/free',
    'nvidia/nemotron-3.5-super-vl:free',
    'cohere/north-mini-code:free',
    'liquid/lfm-2.5-2.6b:free'
  ];
begin
  foreach plan_name in array array['free', 'pro', 'ultra'] loop
    for mapping in
      select * from (values
        ('nvidia/nemotron-3-ultra-550b-a55b:free', 'openai/gpt-oss-120b'),
        ('nvidia/nemotron-3.5-lightning:free', 'openai/gpt-oss-20b'),
        ('google/gemma-4-26b-a4b-it:free', 'qwen/qwen3.8-27b')
      ) as model_keys(old_key, new_key)
    loop
      model_key := mapping.old_key;
      new_key := mapping.new_key;
      fallback_limit := case
        when new_key = 'openai/gpt-oss-20b' and plan_name = 'free' then '5'::jsonb
        when new_key = 'openai/gpt-oss-20b' and plan_name = 'pro' then '50'::jsonb
        when new_key = 'openai/gpt-oss-20b' then 'null'::jsonb
        when plan_name = 'free' and new_key = 'openai/gpt-oss-120b' then '10'::jsonb
        when plan_name = 'free' then '10'::jsonb
        when plan_name = 'pro' and new_key = 'openai/gpt-oss-120b' then '75'::jsonb
        when plan_name = 'pro' then '75'::jsonb
        else 'null'::jsonb
      end;

      update public.app_settings
      set data = jsonb_set(
        coalesce(data, '{}'::jsonb),
        array['planLimits', plan_name, new_key],
        coalesce(
          data #> array['planLimits', plan_name, new_key],
          data #> array['planLimits', plan_name, model_key],
          case when new_key = 'openai/gpt-oss-20b' then data #> array['planLimits', plan_name, 'openrouter/free'] end,
          fallback_limit
        ),
        true
      ) #- array['planLimits', plan_name, model_key], updated_at = now()
      where key = 'platform';
    end loop;
  end loop;

  foreach plan_name in array array['free', 'pro', 'ultra'] loop
    foreach model_key in array obsolete_keys loop
      update public.app_settings
      set data = data #- array['planLimits', plan_name, model_key], updated_at = now()
      where key = 'platform'
        and data #> array['planLimits', plan_name, model_key] is not null;
    end loop;
  end loop;

  -- Combine prior GPT OSS 20B counters from both the Groq and router buckets.
  update public.daily_usage
  set data = jsonb_set(
    (coalesce(data, '{}'::jsonb) - 'nvidia/nemotron-3.5-lightning:free' - 'openrouter/free'),
    '{openai/gpt-oss-20b}', to_jsonb(
      coalesce(nullif(data ->> 'openai/gpt-oss-20b', '')::integer, 0)
      + coalesce(nullif(data ->> 'nvidia/nemotron-3.5-lightning:free', '')::integer, 0)
      + coalesce(nullif(data ->> 'openrouter/free', '')::integer, 0)
    ), true
  ), updated_at = now()
  where data ? 'nvidia/nemotron-3.5-lightning:free' or data ? 'openrouter/free';

  update public.daily_usage
  set data = jsonb_set(data - 'nvidia/nemotron-3-ultra-550b-a55b:free', '{openai/gpt-oss-120b}',
      to_jsonb(coalesce(nullif(data ->> 'openai/gpt-oss-120b', '')::integer, 0)
        + coalesce(nullif(data ->> 'nvidia/nemotron-3-ultra-550b-a55b:free', '')::integer, 0)), true),
      updated_at = now()
  where data ? 'nvidia/nemotron-3-ultra-550b-a55b:free';

  update public.daily_usage
  set data = jsonb_set(data - 'google/gemma-4-26b-a4b-it:free', '{qwen/qwen3.8-27b}',
      to_jsonb(coalesce(nullif(data ->> 'qwen/qwen3.8-27b', '')::integer, 0)
        + coalesce(nullif(data ->> 'google/gemma-4-26b-a4b-it:free', '')::integer, 0)), true),
      updated_at = now()
  where data ? 'google/gemma-4-26b-a4b-it:free';

  update public.daily_usage
  set data = data - keys.key
  from unnest(obsolete_keys) as keys(key)
  where data ? keys.key;

  -- Preserve conversation continuity with a supported Groq model selected.
  update public.conversations
  set data = jsonb_set(data, '{model}', '"GPT OSS 20B"'::jsonb, true), updated_at = now()
  where data ->> 'model' in (
    'Mansh Mode', 'Auto', 'Nemotron 3.5 Lightning',
    'nvidia/nemotron-3.5-lightning:free', 'openrouter/free'
  );
  update public.conversations
  set data = jsonb_set(data, '{model}', '"GPT OSS 120B"'::jsonb, true), updated_at = now()
  where data ->> 'model' in ('Nemotron 3 Ultra', 'nvidia/nemotron-3-ultra-550b-a55b:free');
  update public.conversations
  set data = jsonb_set(data, '{model}', '"Qwen 3.8 27B"'::jsonb, true), updated_at = now()
  where data ->> 'model' in (
    'Nemotron 3.5 Super VL', 'Gemma 4 26B A4B',
    'nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-26b-a4b-it:free'
  );

  -- Keep the RPC security and grants while changing its fixed model allowlist.
  function_definition := pg_get_functiondef('public.consume_manshverse_usage(text)'::regprocedure);
  function_definition := regexp_replace(function_definition,
    $pattern$p_model_key not in \([^)]*\)$pattern$,
    $replacement$p_model_key not in ('openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b')$replacement$, 'g');
  function_definition := regexp_replace(function_definition,
    $pattern$v_limit := case v_plan.*?end;$pattern$,
    $replacement$v_limit := case v_plan
      when 'ultra' then null
      when 'pro' then case p_model_key when 'openai/gpt-oss-20b' then 50 when 'openai/gpt-oss-120b' then 75 when 'qwen/qwen3.8-27b' then 75 end
      else case p_model_key when 'openai/gpt-oss-20b' then 5 when 'openai/gpt-oss-120b' then 10 when 'qwen/qwen3.8-27b' then 10 end
    end;$replacement$, 'g');
  execute function_definition;

  function_definition := pg_get_functiondef('public.release_manshverse_usage(text)'::regprocedure);
  function_definition := regexp_replace(function_definition,
    $pattern$p_model_key not in \([^)]*\)$pattern$,
    $replacement$p_model_key not in ('openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b')$replacement$, 'g');
  execute function_definition;
end;
$$;
