-- Add individual guest passes and purchase-level M-Pesa payments.
-- BACKUP REQUIRED FIRST: create a data-only copy named
-- public.shs_gala_tickets_backup_20261123 before running this migration.
begin;
do $$ begin
  if to_regclass('public.shs_gala_tickets_backup_20261123') is null then
    raise exception 'Create public.shs_gala_tickets_backup_20261123 before running this migration.';
  end if;
  if (select count(*) from public.shs_gala_tickets_backup_20261123) <> (select count(*) from public.shs_gala_tickets) then
    raise exception 'The ticket backup row count does not match the live table.';
  end if;
end $$;

-- Replace the previous blanket owner assumption with explicit organizer roles.
create table public.shs_gala_organizers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','pass-desk','door-staff')),
  created_at timestamptz not null default now()
);
insert into public.shs_gala_organizers(user_id, role)
select id, 'admin' from auth.users on conflict (user_id) do nothing;
alter table public.shs_gala_organizers enable row level security;
grant select on public.shs_gala_organizers to authenticated;
create or replace function public.current_shs_gala_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.shs_gala_organizers where user_id = auth.uid() $$;
revoke all on function public.current_shs_gala_role() from public, anon;
grant execute on function public.current_shs_gala_role() to authenticated;
create policy "SHS organizers read own role" on public.shs_gala_organizers for select to authenticated
  using (user_id = auth.uid() or public.current_shs_gala_role() = 'admin');

-- Limit the legacy table to admin/pass-desk. Door staff use the token RPCs only.
drop policy if exists "SHS admins read tickets" on public.shs_gala_tickets;
drop policy if exists "SHS admins issue tickets" on public.shs_gala_tickets;
drop policy if exists "SHS admins check in tickets" on public.shs_gala_tickets;
create policy "SHS admins and pass desk read legacy tickets" on public.shs_gala_tickets for select to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk issue legacy tickets" on public.shs_gala_tickets for insert to authenticated with check (auth.uid() = issued_by and public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk update legacy tickets" on public.shs_gala_tickets for update to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk')) with check (public.current_shs_gala_role() in ('admin','pass-desk'));

-- Preserve the original ticket records and expand the payment state values.
alter table public.shs_gala_tickets drop constraint if exists shs_gala_tickets_payment_status_check;
update public.shs_gala_tickets set payment_status = 'paid' where payment_status = 'confirmed';
alter table public.shs_gala_tickets add constraint shs_gala_tickets_payment_status_check check (payment_status in ('pending','paid'));

create table public.shs_gala_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  package_type text not null check (package_type in ('single','couple','group_3','group_5')),
  guest_count smallint not null check (guest_count in (1,2,3,5)),
  amount_due numeric(10,2) not null check (amount_due > 0),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.shs_gala_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shs_gala_orders(id) on delete cascade,
  mpesa_code text not null,
  amount numeric(10,2) not null check (amount > 0),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index shs_gala_payments_mpesa_unique on public.shs_gala_payments (upper(btrim(mpesa_code)));
create table public.shs_gala_individual_passes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shs_gala_orders(id) on delete restrict,
  event_id uuid not null,
  ticket_code text not null unique default ('SHS'||lpad(nextval('public.shs_gala_ticket_number_seq')::text,4,'0')),
  qr_token uuid not null unique default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  department text not null check (department in ('Medical Laboratory Sciences','Nursing','Clinical Medicine','Public Health','Community Health')),
  package_type text not null check (package_type in ('single','couple','group_3','group_5')),
  guest_count smallint not null default 1 check (guest_count = 1),
  payment_status text not null default 'paid' check (payment_status in ('pending','paid')),
  status text not null default 'Not checked in' check (status in ('Not checked in','Checked in','Cancelled')),
  price_paid numeric(10,2) not null default 0 check (price_paid >= 0),
  currency text not null default 'KES',
  issued_by uuid not null references auth.users(id),
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shs_gala_orders enable row level security;
alter table public.shs_gala_payments enable row level security;
alter table public.shs_gala_individual_passes enable row level security;
revoke all on public.shs_gala_orders, public.shs_gala_payments, public.shs_gala_individual_passes from anon;
grant select, insert, update on public.shs_gala_orders, public.shs_gala_payments, public.shs_gala_individual_passes to authenticated;
grant usage, select on sequence public.shs_gala_ticket_number_seq to authenticated;
create policy "SHS admins and pass desk read orders" on public.shs_gala_orders for select to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk create orders" on public.shs_gala_orders for insert to authenticated with check (auth.uid() = created_by and public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk update orders" on public.shs_gala_orders for update to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk')) with check (public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk read payments" on public.shs_gala_payments for select to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk create payments" on public.shs_gala_payments for insert to authenticated with check (auth.uid() = recorded_by and public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk read individual passes" on public.shs_gala_individual_passes for select to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk issue individual passes" on public.shs_gala_individual_passes for insert to authenticated with check (auth.uid() = issued_by and public.current_shs_gala_role() in ('admin','pass-desk'));
create policy "SHS admins and pass desk update individual passes" on public.shs_gala_individual_passes for update to authenticated using (public.current_shs_gala_role() in ('admin','pass-desk')) with check (public.current_shs_gala_role() in ('admin','pass-desk'));

create or replace function public.issue_shs_gala_purchase(
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
  select coalesce(sum((item->>'amount')::numeric),0) into v_received from jsonb_array_elements(p_payments) as payment(item);
  if v_received > p_amount_due then raise exception 'Recorded payments cannot exceed the package total.'; end if;
  insert into public.shs_gala_orders(event_id,package_type,guest_count,amount_due,payment_status,created_by)
  values(p_event_id,p_package_type,p_guest_count,p_amount_due,case when v_received >= p_amount_due then 'paid' else 'pending' end,v_user_id) returning id into v_order_id;
  for v_item in select item from jsonb_array_elements(p_payments) as payment(item) loop
    insert into public.shs_gala_payments(order_id,mpesa_code,amount,recorded_by) values(v_order_id,upper(trim(v_item->>'mpesaCode')),(v_item->>'amount')::numeric,v_user_id);
  end loop;
  for v_item in select item from jsonb_array_elements(p_attendees) as guest(item) loop
    insert into public.shs_gala_individual_passes(order_id,event_id,full_name,phone,department,package_type,guest_count,payment_status,status,issued_by)
    values(v_order_id,p_event_id,trim(v_item->>'fullName'),trim(p_phone),v_item->>'department',p_package_type,1,case when v_received >= p_amount_due then 'paid' else 'pending' end,'Not checked in',v_user_id)
    returning * into v_pass;
    return next v_pass;
  end loop;
end;
$$;
revoke all on function public.issue_shs_gala_purchase(uuid,text,smallint,numeric,text,jsonb,jsonb) from public, anon;
grant execute on function public.issue_shs_gala_purchase(uuid,text,smallint,numeric,text,jsonb,jsonb) to authenticated;

-- Record later installments atomically. The order is locked to prevent concurrent
-- payments from pushing its received total above the agreed amount.
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
  select coalesce(sum(amount),0) into v_received from public.shs_gala_payments where order_id=p_order_id;
  if v_received + p_amount > v_order.amount_due then raise exception 'This payment is more than the remaining balance.'; end if;
  insert into public.shs_gala_payments(order_id,mpesa_code,amount,recorded_by)
    values(p_order_id,upper(trim(p_mpesa_code)),p_amount,v_user_id);
  select coalesce(sum(amount),0) into v_received from public.shs_gala_payments where order_id=p_order_id;
  v_status := case when v_received >= v_order.amount_due then 'paid' else 'pending' end;
  update public.shs_gala_orders set payment_status=v_status where id=p_order_id;
  update public.shs_gala_individual_passes set payment_status=v_status
    where order_id=p_order_id;
  return jsonb_build_object('order_id',p_order_id,'payment_status',v_status,'amount_received',v_received,'amount_due',v_order.amount_due,'balance_due',greatest(v_order.amount_due-v_received,0));
end;
$$;
revoke all on function public.record_shs_gala_payment(uuid,text,numeric) from public, anon;
grant execute on function public.record_shs_gala_payment(uuid,text,numeric) to authenticated;

create or replace function public.search_shs_gala_checkin_pass(p_query text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_query text := trim(coalesce(p_query,'')); v_result jsonb;
begin
  if coalesce(public.current_shs_gala_role(),'') not in ('admin','pass-desk','door-staff') then raise exception 'You are not assigned to gala check-in.'; end if;
  if char_length(v_query) < 3 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(matches)), '[]'::jsonb) into v_result from (
    select ticket_code, qr_token, full_name, department, guest_count, payment_status, status
    from public.shs_gala_individual_passes
    where ticket_code ilike v_query or qr_token::text = lower(v_query) or full_name ilike '%'||v_query||'%'
    union all
    select ticket_code, qr_token, full_name, department, guest_count, payment_status, status
    from public.shs_gala_tickets
    where ticket_code ilike v_query or qr_token::text = lower(v_query) or full_name ilike '%'||v_query||'%'
    limit 8
  ) matches;
  return v_result;
end;
$$;

create or replace function public.check_in_shs_gala_pass(p_qr_token uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_row record;
begin
  if coalesce(public.current_shs_gala_role(),'') not in ('admin','pass-desk','door-staff') then raise exception 'You are not assigned to gala check-in.'; end if;
  update public.shs_gala_individual_passes set status='Checked in', checked_in_at=now()
    where qr_token=p_qr_token and status='Not checked in' and payment_status='paid'
    returning id,ticket_code,qr_token,full_name,department,guest_count,payment_status,status into v_row;
  if found then return jsonb_build_object('id',v_row.id,'ticket_code',v_row.ticket_code,'qr_token',v_row.qr_token,'full_name',v_row.full_name,'department',v_row.department,'guest_count',v_row.guest_count,'payment_status',v_row.payment_status,'status',v_row.status); end if;
  update public.shs_gala_tickets set status='Checked in', checked_in_at=now()
    where qr_token=p_qr_token and status='Not checked in' and payment_status='paid'
    returning id,ticket_code,qr_token,full_name,department,guest_count,payment_status,status into v_row;
  if found then return jsonb_build_object('id',v_row.id,'ticket_code',v_row.ticket_code,'qr_token',v_row.qr_token,'full_name',v_row.full_name,'department',v_row.department,'guest_count',v_row.guest_count,'payment_status',v_row.payment_status,'status',v_row.status); end if;
  if exists(select 1 from public.shs_gala_individual_passes where qr_token=p_qr_token and status='Checked in') or exists(select 1 from public.shs_gala_tickets where qr_token=p_qr_token and status='Checked in') then raise exception 'This pass has already been checked in.'; end if;
  if exists(select 1 from public.shs_gala_individual_passes where qr_token=p_qr_token and payment_status<>'paid') or exists(select 1 from public.shs_gala_tickets where qr_token=p_qr_token and payment_status not in ('paid','confirmed')) then raise exception 'This pass is not paid and cannot be checked in.'; end if;
  raise exception 'No pass found for that QR token.';
end;
$$;
revoke all on function public.search_shs_gala_checkin_pass(text) from public, anon;
revoke all on function public.check_in_shs_gala_pass(uuid) from public, anon;
grant execute on function public.search_shs_gala_checkin_pass(text) to authenticated;
grant execute on function public.check_in_shs_gala_pass(uuid) to authenticated;

commit;
