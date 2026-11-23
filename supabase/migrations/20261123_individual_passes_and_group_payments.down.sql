-- Rollback for 20261123_individual_passes_and_group_payments.sql.
-- Refuses to remove any new pass, payment, order, or non-default role assignment.
begin;
do $$
begin
  if exists (select 1 from public.shs_gala_orders) then
    raise exception 'Rollback stopped: SHS Gala purchases exist. Export and reconcile them before removing the new tables.';
  end if;
  if exists (select 1 from public.shs_gala_organizers where role <> 'admin') then
    raise exception 'Rollback stopped: organizer roles have been assigned. Restore those accounts before removing role data.';
  end if;
end $$;
drop function if exists public.check_in_shs_gala_pass(uuid);
drop function if exists public.search_shs_gala_checkin_pass(text);
drop function if exists public.issue_shs_gala_purchase(uuid,text,smallint,numeric,text,jsonb,jsonb);
drop function if exists public.record_shs_gala_payment(uuid,text,numeric);
drop table if exists public.shs_gala_individual_passes;
drop table if exists public.shs_gala_payments;
drop table if exists public.shs_gala_orders;
drop policy if exists "SHS admins and pass desk read legacy tickets" on public.shs_gala_tickets;
drop policy if exists "SHS admins and pass desk issue legacy tickets" on public.shs_gala_tickets;
drop policy if exists "SHS admins and pass desk update legacy tickets" on public.shs_gala_tickets;
drop policy if exists "SHS organizers read own role" on public.shs_gala_organizers;
drop function if exists public.current_shs_gala_role();
drop table if exists public.shs_gala_organizers;
create policy "SHS admins read tickets" on public.shs_gala_tickets for select to authenticated using(auth.uid() is not null);
create policy "SHS admins issue tickets" on public.shs_gala_tickets for insert to authenticated with check(auth.uid()=issued_by);
create policy "SHS admins check in tickets" on public.shs_gala_tickets for update to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);
alter table public.shs_gala_tickets drop constraint if exists shs_gala_tickets_payment_status_check;
update public.shs_gala_tickets set payment_status = 'confirmed' where payment_status = 'paid';
alter table public.shs_gala_tickets add constraint shs_gala_tickets_payment_status_check check (payment_status in ('pending','confirmed'));
commit;
