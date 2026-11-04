-- Remove the unavailable North Mini Code and LFM model choices from the
-- server-side quota allowlists and plan settings. Keep historical usage data.
do $$
declare
  function_definition text;
  plan_name text;
  model_key text;
begin
  foreach plan_name in array array['free', 'pro', 'ultra'] loop
    foreach model_key in array array[
      'cohere/north-mini-code:free',
      'liquid/lfm-2.5-2.6b:free'
    ] loop
      update public.app_settings
      set data = data #- array['planLimits', plan_name, model_key], updated_at = now()
      where key = 'platform';
    end loop;
  end loop;

  -- The models are removed from the allowlists; unrelated model limits and
  -- quota counters remain intact. Keep each function's grants and security.
  function_definition := pg_get_functiondef('public.consume_manshverse_usage(text)'::regprocedure);
  function_definition := replace(function_definition, $needle$, 'cohere/north-mini-code:free'$needle$, '');
  function_definition := replace(function_definition, $needle$, 'liquid/lfm-2.5-2.6b:free'$needle$, '');
  execute function_definition;

  function_definition := pg_get_functiondef('public.release_manshverse_usage(text)'::regprocedure);
  function_definition := replace(function_definition, $needle$, 'cohere/north-mini-code:free'$needle$, '');
  function_definition := replace(function_definition, $needle$, 'liquid/lfm-2.5-2.6b:free'$needle$, '');
  execute function_definition;
end;
$$;
