ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS blocked_numbers text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS custom_rules text NOT NULL DEFAULT '';