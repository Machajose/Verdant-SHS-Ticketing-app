-- Roll back only after deploying code that no longer calls the installment RPCs.
begin;
drop function if exists public.issue_shs_gala_purchase_with_balance(uuid,text,smallint,numeric,text,jsonb,jsonb);
drop function if exists public.record_shs_gala_payment(uuid,text,numeric);
drop policy if exists "SHS admins and pass desk update orders" on public.shs_gala_orders;
commit;
