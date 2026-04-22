-- 005_xendit_payments.sql
--
-- Extend merchant_subscriptions with the payment_provider column and a
-- broader status set so we can represent Xendit (and future) invoice
-- states. Safe to re-run.

ALTER TABLE public.merchant_subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'xendit-mock';

-- Drop and re-add the status CHECK so we can add new states.
ALTER TABLE public.merchant_subscriptions
  DROP CONSTRAINT IF EXISTS merchant_subscriptions_status_check;

ALTER TABLE public.merchant_subscriptions
  ADD CONSTRAINT merchant_subscriptions_status_check
  CHECK (status IN ('pending','active','cancelled','expired','failed'));

-- A small table to record Xendit invoice payloads / webhook events.
-- Useful even in mock mode so we can simulate paid webhooks in dev.
CREATE TABLE IF NOT EXISTS public.xendit_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID REFERENCES public.merchant_subscriptions(id) ON DELETE CASCADE,
  merchant_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_id      TEXT NOT NULL,
  xendit_id        TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'PHP',
  status           TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PAID','EXPIRED','FAILED')),
  invoice_url      TEXT,
  payload          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xendit_invoices_xendit_id
  ON public.xendit_invoices(xendit_id);

ALTER TABLE public.xendit_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants read own invoices" ON public.xendit_invoices;
CREATE POLICY "Merchants read own invoices"
  ON public.xendit_invoices FOR SELECT
  TO authenticated
  USING (
    merchant_id = auth.uid()
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin')
  );

DROP POLICY IF EXISTS "Admins write invoices" ON public.xendit_invoices;
CREATE POLICY "Admins write invoices"
  ON public.xendit_invoices FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'));
