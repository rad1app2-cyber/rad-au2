CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS request_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_note text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS contacts_agent_phone_uniq ON public.contacts(agent_id, phone) WHERE agent_id IS NOT NULL AND phone <> '';

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS last_digest_on date;

CREATE TABLE public.sent_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  offer_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, customer_phone, offer_ref)
);
GRANT SELECT ON public.sent_offers TO authenticated;
GRANT ALL ON public.sent_offers TO service_role;
ALTER TABLE public.sent_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own sent offers" ON public.sent_offers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.user_id = auth.uid()));

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  property_ref text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested',
  reminded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own appointments" ON public.appointments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.user_id = auth.uid()));