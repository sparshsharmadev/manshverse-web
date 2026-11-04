-- Move stored model labels and quota keys to upstream model identifiers.
do $$
declare
  model_map text[][] := array[
    array['Milkcake 2.7', 'qwen/qwen3-32b', 'Qwen3 32B'],
    array['Astral 2.0', 'openai/gpt-oss-120b', 'GPT-OSS 120B'],
    array['Impulse 1.4', 'llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile'],
    array['Cornea 1.0', 'meta-llama/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B 16E Instruct'],
    array['Nova 1.0', 'moonshotai/kimi-k2-instruct-0905', 'Kimi K2 Instruct 0905'],
    array['Spark 1.0', 'openai/gpt-oss-20b', 'GPT-OSS 20B']
  ];
  mapping text[];
  plan_name text;
  old_function text;
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

    update public.conversations
    set data = jsonb_set(data, '{model}', to_jsonb(mapping[3]), true), updated_at = now()
    where data ->> 'model' = mapping[1];

    update public.messages
    set data = jsonb_set(data, '{modelLabel}', to_jsonb(mapping[3]), true)
    where data ->> 'modelLabel' = mapping[1];
  end loop;

  update public.conversations
  set data = jsonb_set(data, '{model}', '"Auto"'::jsonb, true), updated_at = now()
  where data ->> 'model' = 'Mansh Mode';

  -- Existing projects have the old human labels embedded in the quota RPCs.
  old_function := pg_get_functiondef('public.consume_manshverse_usage(text)'::regprocedure);
  foreach mapping slice 1 in array model_map loop
    old_function := replace(old_function, mapping[1], mapping[2]);
  end loop;
  execute old_function;

  old_function := pg_get_functiondef('public.release_manshverse_usage(text)'::regprocedure);
  foreach mapping slice 1 in array model_map loop
    old_function := replace(old_function, mapping[1], mapping[2]);
  end loop;
  execute old_function;
end;
$$;
