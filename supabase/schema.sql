-- Fresh schema for the SHS Gala admin workspace.
-- Every signed-in Auth user is an administrator. Disable public sign-ups in Supabase Auth.
create extension if not exists pgcrypto;
create sequence if not exists public.shs_gala_ticket_number_seq start 1;
create table if not exists public.shs_gala_tickets(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null default '6d36a74f-a976-44c4-aef4-200f6b2d0400',
 ticket_code text not null unique default('SHS'||lpad(nextval('public.shs_gala_ticket_number_seq')::text,4,'0')),
 qr_token uuid not null unique default gen_random_uuid(),
 full_name text not null check(char_length(trim(full_name)) between 2 and 100),
 phone text not null check(char_length(trim(phone)) between 7 and 30),
 department text not null check(department in('Medical Laboratory Sciences','Nursing','Clinical Medicine','Public Health','Community Health')),
 package_type text not null check(package_type in('single','group_3','group_5')),
 guest_count smallint not null check(guest_count in(1,3,5)),
 mpesa_code text not null,
 payment_status text not null default 'confirmed' check(payment_status in('pending','confirmed')),
 status text not null default 'Not checked in' check(status in('Not checked in','Checked in','Cancelled')),
 price_paid numeric(10,2) not null check(price_paid>=0),
 currency text not null default 'KES',
 issued_by uuid not null references auth.users(id),
 checked_in_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists shs_gala_tickets_mpesa_unique on public.shs_gala_tickets(upper(btrim(mpesa_code))) where mpesa_code is not null and btrim(mpesa_code)<>'';
alter table public.shs_gala_tickets enable row level security;
revoke all on public.shs_gala_tickets from anon;
grant select,insert,update on public.shs_gala_tickets to authenticated;
grant usage,select on sequence public.shs_gala_ticket_number_seq to authenticated;
drop policy if exists "SHS admins read tickets" on public.shs_gala_tickets;
drop policy if exists "SHS admins issue tickets" on public.shs_gala_tickets;
drop policy if exists "SHS admins check in tickets" on public.shs_gala_tickets;
create policy "SHS admins read tickets" on public.shs_gala_tickets for select to authenticated using(auth.uid() is not null);
create policy "SHS admins issue tickets" on public.shs_gala_tickets for insert to authenticated with check(auth.uid()=issued_by);
create policy "SHS admins check in tickets" on public.shs_gala_tickets for update to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);
revoke all on sequence public.shs_gala_ticket_number_seq from anon;