-- The private bucket view uses security_invoker, so the dedicated service role
-- needs read access to the two public tables referenced by that view. This does
-- not grant the normal app role any private-schema access.
GRANT SELECT ON TABLE public.unit_variants, public.budget_buckets TO propcompare_service;
