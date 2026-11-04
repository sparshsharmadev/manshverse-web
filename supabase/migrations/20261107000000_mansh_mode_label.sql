-- Rename the free router label for existing conversations and message history.
update public.conversations
set data = jsonb_set(data, '{model}', '"Mansh Mode"'::jsonb, true), updated_at = now()
where data ->> 'model' = 'Auto · Free';

update public.messages
set data = jsonb_set(data, '{modelLabel}', '"Mansh Mode"'::jsonb, true)
where data ->> 'modelLabel' = 'Auto · Free';
