alter table public.profiles
  add column if not exists ai_profile_builder_paid_at timestamptz;

comment on column public.profiles.ai_profile_builder_paid_at is
  'Timestamp of the successful 2.99€ Stripe payment that unlocked the AI profile builder, set by the stripe-webhook-ai-builder edge function.';
