-- Add installment payments to an already-installed SHS Gala pass schema.
-- This patch is additive: it creates two new RPCs and one missing policy.
-- It does not rewrite tables or existing ticket records.
begin;

do $$
begin
  if to_regclass('public.shs_gala_organizers') is null
    or to_regclass('public.shs_gala_orders') is null
    or to_regclass('public.shs_gala_payments') is null
    or to_regclass('public.shs_gala_individual_passes') is null then
    raise exception 'Required SHS Gala tables are missing. Stop and inspect the installed schema.';
  end if;
  if to_regclass('public.shs_gala_tickets_backup_20261123') is null then
    raise exception 'Required ticket backup is missing. Create and verify it before applying this patch.';
  end if;
  if (select count(*) from public.shs_gala_tickets_backup_20261123)
     <> (select count(*) from public.shs_gala_tickets) then
    raise exception 'Ticket backup row count differs from the live ticket table.';
  end if;
end $$;

grant update on public.shs_gala_orders to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='shs_gala_orders'
      and policyname='SHS admins and pass desk update orders'
  ) then
    create policy "SHS admins and pass desk update orders"
      on public.shs_gala_orders for update to authenticated
      using (public.current_shs_gala_role() in ('admin','pass-desk'))
      with check (public.current_shs_gala_role() in ('admin','pass-desk'));
  end if;
end $$;

-- Keep the original issue RPC intact. This new RPC permits an empty or partial
-- payment list and issues each guest a separate pending pass until paid in full.
create or replace function public.issue_shs_gala_purchase_with_balance(
  p_event_id uuid, p_package_type text, p_guest_count smallint, p_amount_due numeric,
  p_phone text, p_attendees jsonb, p_payments jsonb
) returns setof public.shs_gala_individual_passes
language plpgsql security invoker set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_count integer;
  v_received numeric(10,2);
  v_order_id uuid;
  v_item jsonb;
  v_pass public.shs_gala_individual_passes;
  v_status text;
begin
  if v_user_id is null then raise exception 'Sign in is required to issue passes.'; end if;
  if coalesce(public.current_shs_gala_role(),'') not in ('admin','pass-desk') then raise exception 'Only admins and pass desk staff can issue passes.'; end if;
  v_expected_count := case p_package_type when 'single' then 1 when 'couple' then 2 when 'group_3' then 3 when 'group_5' then 5 else null end;
  if v_expected_count is null or p_guest_count <> v_expected_count then raise exception 'The package and guest count do not match.'; end if;
  if coalesce(jsonb_typeof(p_attendees),'') <> 'array' or coalesce(jsonb_array_length(p_attendees),0) <> v_expected_count then raise exception 'Enter each guest before issuing passes.'; end if;
  if coalesce(jsonb_typeof(p_payments),'') <> 'array' then raise exception 'Payment transactions must be provided as a list.'; end if;
  if p_amount_due is null or p_amount_due <= 0 or coalesce(trim(p_phone),'') = '' then raise exception 'A valid package total and contact phone are required.'; end if;
  if exists (select 1 from jsonb_array_elements(p_attendees) as guest(item) where char_length(trim(coalesce(item->>'fullName',''))) < 2 or coalesce(item->>'department','') not in ('Medical Laboratory Sciences','Nursing','Clinical Medicine','Public Health','Community Health')) then raise exception 'Each pass needs a guest name and valid department.'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) as payment(item) where char_length(trim(coalesce(item->>'mpesaCode',''))) < 6 or coalesce((item->>'amount')::numeric,0) <= 0) then raise exception 'Each transaction needs a valid code and positive amount.'; end if;
  if (select count(distinct upper(trim(item->>'mpesaCode'))) from jsonb_array_elements(p_payments) as payment(item)) <> jsonb_array_length(p_payments) then raise exception 'M-Pesa transaction codes must be unique.'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) as payment(item) join public.shs_gala_tickets t on upper(trim(t.mpesa_code)) = upper(trim(item->>'mpesaCode'))) then raise exception 'An M-Pesa transaction code has already been used.'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) as payment(item) join public.shs_gala_payments t on upper(trim(t.mpesa_code)) = upper(trim(item->>'mpesaCode'))) then raise exception 'An M-Pesa transaction code has already been used.'; end if;
  select coalesce(sum((item->>'amount')::numeric),0) into v_received from jsonb_array_elements(p_payments) as payment(item);
  if v_received > p_amount_due then raise exception 'Recorded payments cannot exceed the package total.'; end if;
  v_status := case when v_received >= p_amount_due then 'paid' else 'pending' end;
  insert into public.shs_gala_orders(event_id,package_type,guest_count,amount_due,payment_status,created_by)
    values(p_event_id,p_package_type,p_guest_count,p_amount_due,v_status,v_user_id) returning id into v_order_id;
  for v_item in select item from jsonb_array_elements(p_payments) as payment(item) loop
    insert into public.shs_gala_payments(order_id,mpesa_code,amount,recorded_by)
      values(v_order_id,upper(trim(v_item->>'mpesaCode')),(v_item->>'amount')::numeric,v_user_id);
  end loop;
  for v_item in select item from jsonb_array_elements(p_attendees) as guest(item) loop
    insert into public.shs_gala_individual_passes(order_id,event_id,full_name,phone,department,package_type,guest_count,payment_status,status,issued_by)
      values(v_order_id,p_event_id,trim(v_item->>'fullName'),trim(p_phone),v_item->>'department',p_package_type,1,v_status,'Not checked in',v_user_id)
      returning * into v_pass;
    return next v_pass;
  end loop;
end;
$$;
revoke all on function public.issue_shs_gala_purchase_with_balance(uuid,text,smallint,numeric,text,jsonb,jsonb) from public, anon;
grant execute on function public.issue_shs_gala_purchase_with_balance(uuid,text,smallint,numeric,text,jsonb,jsonb) to authenticated;

-- Accept one later installment under a row lock; never allow overpayment.
create or replace function public.record_shs_gala_payment(p_order_id uuid, p_mpesa_code text, p_amount numeric)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.shs_gala_orders;
  v_received numeric(10,2);
  v_status text;
begin
  if v_user_id is null then raise exception 'Sign in is required to record a payment.'; end if;
  if coalesce(public.current_shs_gala_role(),'') not in ('admin','pass-desk') then raise exception 'Only admins and pass desk staff can record payments.'; end if;
  if char_length(trim(coalesce(p_mpesa_code,''))) < 6 or p_amount is null or p_amount <= 0 then raise exception 'Enter a valid M-Pesa code and positive amount.'; end if;
  select * into v_order from public.shs_gala_orders where id=p_order_id for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if v_order.payment_status='paid' then raise exception 'This purchase is already fully paid.'; end if;
  if exists(select 1 from public.shs_gala_tickets where upper(trim(mpesa_code))=upper(trim(p_mpesa_code))) then raise exception 'That M-Pesa transaction code has already been used.'; end if;
  if exists(select 1 from public.shs_gala_payments where upper(trim(mpesa_code))=upper(trim(p_mpesa_code))) then raise exception 'That M-Pesa transaction code has already been used.'; end if;
  select coalesce(sum(amount),0) into v_received from public.shs_gala_payments where order_id=p_order_id;
  if v_received + p_amount > v_order.amount_due then raise exception 'This payment is more than the remaining balance.'; end if;
  insert into public.shs_gala_payments(order_id,mpesa_code,amount,recorded_by)
    values(p_order_id,upper(trim(p_mpesa_code)),p_amount,v_user_id);
  select coalesce(sum(amount),0) into v_received from public.shs_gala_payments where order_id=p_order_id;
  v_status := case when v_received >= v_order.amount_due then 'paid' else 'pending' end;
  update public.shs_gala_orders set payment_status=v_status where id=p_order_id;
  update public.shs_gala_individual_passes set payment_status=v_status where order_id=p_order_id;
  return jsonb_build_object('order_id',p_order_id,'payment_status',v_status,'amount_received',v_received,'amount_due',v_order.amount_due,'balance_due',greatest(v_order.amount_due-v_received,0));
end;
$$;
revoke all on function public.record_shs_gala_payment(uuid,text,numeric) from public, anon;
grant execute on function public.record_shs_gala_payment(uuid,text,numeric) to authenticated;

commit;
