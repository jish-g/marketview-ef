-- global_context.narrative: the language model's four paragraphs (summary, global, india, link),
-- written from the engine's structured output and validated so no paragraph cites a number the
-- engine did not supply. narrative_key is a fingerprint of the verdicts + events the paragraphs
-- describe, so an unchanged picture reuses the previous narrative instead of calling the model
-- every fifteen minutes.
alter table public.global_context add column if not exists narrative jsonb;
alter table public.global_context add column if not exists narrative_key text;
