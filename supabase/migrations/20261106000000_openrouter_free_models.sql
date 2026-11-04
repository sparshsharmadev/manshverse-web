-- Switch quota keys to the selected OpenRouter free endpoints.
do $$
declare
  model_map text[][] := array[
    array['qwen/qwen3-32b', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
    array['openai/gpt-oss-120b', 'nvidia/nemotron-3.5-super-vl:free'],
    array['llama-3.3-70b-versatile', 'nvidia/nemotron-3.5-lightning:free'],
    array['meta-llama/llama-4-scout-17b-16e-instruct', 'google/gemma-4-26b-a4b-it:free'],
    array['moonshotai/kimi-k2-instruct-0905', 'cohere/north-mini-code:free'],
    array['openai/gpt-oss-20b', 'openrouter/free']
  ];
  mapping text[];
  plan_name text;
  function_definition text;
begin
  foreach mapping slice 1 in array model_map loop
    foreach plan_name in array array['free', 'pro', 'ultra'] loop
      update public.app_settings
      set data = jsonb_set(
        data,
        array['planLimits', plan_name, mapping[2]],
        coalesce(data #> array['planLimits', plan_name, mapping[2]], data #> array['planLimits', plan_name, mapping[1]]),
        true
      ) #- array['planLimits', plan_name, mapping[1]], updated_at = now()
      where key = 'platform' and data #> array['planLimits', plan_name, mapping[1]] is not null;
    end loop;

    update public.daily_usage
    set data = jsonb_set(data, array[mapping[2]], coalesce(data -> mapping[2], data -> mapping[1]), true) - mapping[1],
        updated_at = now()
    where data ? mapping[1];
  end loop;

  -- Existing conversations can keep being opened with the free router selected.
  update public.conversations
  set data = jsonb_set(data, '{model}', '"Mansh Mode"'::jsonb, true), updated_at = now()
  where data ->> 'model' in (
    'Mansh Mode', 'Auto', 'Qwen3 32B', 'GPT-OSS 120B',
    'Llama 3.3 70B Versatile', 'Llama 4 Scout 17B 16E Instruct',
    'Kimi K2 Instruct 0905', 'GPT-OSS 20B'
  );

  -- Update existing quota RPC allowlists and limit fallbacks without changing
  -- their security-definer settings or database grants.
  function_definition := pg_get_functiondef('public.consume_manshverse_usage(text)'::regprocedure);
  foreach mapping slice 1 in array model_map loop
    function_definition := replace(function_definition, mapping[1], mapping[2]);
  end loop;
  execute function_definition;

  function_definition := pg_get_functiondef('public.release_manshverse_usage(text)'::regprocedure);
  foreach mapping slice 1 in array model_map loop
    function_definition := replace(function_definition, mapping[1], mapping[2]);
  end loop;
  execute function_definition;
end;
$$;
