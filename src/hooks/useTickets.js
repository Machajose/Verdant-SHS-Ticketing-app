import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { localPreviewEvent } from "../config/event";

const packageLabels = { single: "Single admission", couple: "Couple", group_3: "Group of 3", group_5: "Group of 5" };
function mapTicket(row, payments = []) {
  const count = Number(row.guest_count || 1);
  const orderPayments = row.order_id ? payments.filter(payment => payment.order_id === row.order_id) : [];
  const refs = orderPayments.map(payment => payment.mpesa_code).filter(Boolean);
  return {
    ...row,
    ticketId: row.ticket_code,
    token: row.qr_token,
    fullName: row.full_name,
    mpesaCode: refs.length ? refs.join(", ") : row.mpesa_code,
    ticketType: packageLabels[row.package_type] || "Single admission",
    guestCount: count,
    pricePaid: Number(row.price_paid || 0),
    paymentRefs: refs,
    payment_status: row.payment_status === "confirmed" ? "paid" : row.payment_status,
  };
}
function missingNewSchema(error) {
  return ["42P01", "PGRST205", "PGRST202"].includes(error?.code) || /could not find the table|schema cache|function .* does not exist/i.test(error?.message || "");
}

export function useTickets(user, notify, setScanResult, preview = false) {
  const [tickets, setTickets] = useState([]);
  const [event] = useState(localPreviewEvent);
  const [role, setRole] = useState(preview ? "admin" : null);
  const [loading, setLoading] = useState(!preview);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    if (preview) return;
    setLoading(true);
    setLoadError("");
    try {
      const roleResult = await supabase.from("shs_gala_organizers").select("role").eq("user_id", user.id).single();
      if (roleResult.error) throw new Error(roleResult.error.message || "This account has no gala role assigned.");
      const activeRole = roleResult.data.role;
      setRole(activeRole);
      if (activeRole === "door-staff") {
        setTickets([]);
        return;
      }
      if (!["admin", "pass-desk"].includes(activeRole)) throw new Error("This account is not allowed to open the workspace.");
      const [legacyResult, passesResult, paymentsResult] = await Promise.all([
        supabase.from("shs_gala_tickets").select("*").eq("event_id", localPreviewEvent.id).order("created_at", { ascending: false }),
        supabase.from("shs_gala_individual_passes").select("*").eq("event_id", localPreviewEvent.id).order("created_at", { ascending: false }),
        supabase.from("shs_gala_payments").select("order_id,mpesa_code,amount"),
      ]);
      if (legacyResult.error) throw legacyResult.error;
      for (const result of [passesResult, paymentsResult]) if (result.error && !missingNewSchema(result.error)) throw result.error;
      const individualPasses = passesResult.error ? [] : passesResult.data || [];
      const payments = paymentsResult.error ? [] : paymentsResult.data || [];
      const orderTotals = new Map();
      for (const payment of payments) orderTotals.set(payment.order_id, (orderTotals.get(payment.order_id) || 0) + Number(payment.amount || 0));
      const seenOrders = new Set();
      const combined = [...(legacyResult.data || []), ...individualPasses].map(row => {
        const ticket = mapTicket(row, payments);
        if (row.order_id) {
          ticket.pricePaid = seenOrders.has(row.order_id) ? 0 : (orderTotals.get(row.order_id) || 0);
          seenOrders.add(row.order_id);
        }
        return ticket;
      });
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setTickets(combined);
    } catch (error) {
      setLoadError(error.message || "Could not load gala ticket records.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [preview, user.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const createTicket = useCallback(async ({ packageType, amountDue, attendees, phone, payments }) => {
    if (!event) throw new Error("Event details have not loaded yet.");
    const cleanPayments = payments.map(payment => ({ mpesaCode: payment.mpesaCode.trim().toUpperCase(), amount: Number(payment.amount) }));
    const knownCodes = new Set(tickets.flatMap(ticket => String(ticket.mpesaCode || "").split(",").map(code => code.trim().toUpperCase()).filter(Boolean)));
    const repeated = cleanPayments.find(payment => knownCodes.has(payment.mpesaCode));
    if (repeated) throw new Error("That M-Pesa reference is already attached to another purchase.");
    const orderId = crypto.randomUUID();
    const paymentTotal = cleanPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const count = attendees.length;

    if (preview) {
      const now = new Date().toISOString();
      const nextNumber = tickets.length + 1;
      const created = attendees.map((attendee, index) => mapTicket({
        id: crypto.randomUUID(), order_id: orderId, event_id: event.id,
        ticket_code: `SHS${String(nextNumber + index).padStart(4, "0")}`,
        qr_token: crypto.randomUUID(), full_name: attendee.fullName, phone,
        department: attendee.department, package_type: packageType, guest_count: 1,
        mpesa_code: null, payment_status: "paid", status: "Not checked in",
        price_paid: index === 0 ? paymentTotal : 0, currency: "KES", issued_by: user.id,
        created_at: now,
      }, cleanPayments));
      setTickets(current => [...created, ...current]);
      return created;
    }

    const { data, error } = await supabase.rpc("issue_shs_gala_purchase", {
      p_event_id: event.id,
      p_package_type: packageType,
      p_guest_count: count,
      p_amount_due: Number(amountDue),
      p_phone: phone,
      p_attendees: attendees,
      p_payments: cleanPayments,
    });
    if (error) {
      if (missingNewSchema(error) && packageType === "single" && cleanPayments.length === 1) {
        const legacyRow = { event_id: event.id, full_name: attendees[0].fullName, phone, department: attendees[0].department, mpesa_code: cleanPayments[0].mpesaCode, package_type: "single", guest_count: 1, payment_status: "confirmed", status: "Not checked in", price_paid: cleanPayments[0].amount, currency: "KES", issued_by: user.id };
        const legacy = await supabase.from("shs_gala_tickets").insert(legacyRow).select("*").single();
        if (legacy.error) throw legacy.error;
        const ticket = mapTicket(legacy.data);
        setTickets(current => [ticket, ...current]);
        return [ticket];
      }
      if (missingNewSchema(error)) throw new Error("The individual-pass database update is not installed yet. Back up shs_gala_tickets, then run the migration in supabase/migrations before issuing couple or group passes.");
      if (error.code === "23505") throw new Error("One of those M-Pesa transaction codes has already been used.");
      throw error;
    }
    const created = (Array.isArray(data) ? data : data?.passes || []).map(row => mapTicket(row, cleanPayments.map(payment => ({ ...payment, order_id: row.order_id }))));
    if (created[0]) created[0].pricePaid = paymentTotal;
    setTickets(current => [...created, ...current]);
    return created;
  }, [event, tickets, user.id, preview]);

  const checkIn = useCallback(async ticket => {
    try {
      if (ticket.status === "Checked in") throw new Error(`${ticket.fullName} has already checked in.`);
      let updated;
      if (preview) {
        updated = { ...ticket, status: "Checked in", checked_in_at: new Date().toISOString() };
      } else {
        const { data, error } = await supabase.rpc("check_in_shs_gala_pass", { p_qr_token: ticket.token });
        if (error) throw error;
        const checkedPass = Array.isArray(data) ? data[0] : data;
        updated = mapTicket({ ...checkedPass, order_id: ticket.order_id || null }, ticket.paymentRefs?.map(mpesaCode => ({ order_id: ticket.order_id, mpesa_code: mpesaCode })) || []);
      }
      if (ticket.id) setTickets(current => current.map(item => item.id === ticket.id ? updated : item));
      setScanResult({ ok: true, ticket: updated, message: "Admission confirmed. Enjoy the gala." });
      notify(`${updated.fullName} checked in`);
      return updated;
    } catch (error) {
      setScanResult({ ok: false, ticket, message: error.message || "Ticket check-in failed." });
      return null;
    }
  }, [notify, setScanResult, preview]);

  const lookupPass = useCallback(async query => {
    const value = String(query || "").trim();
    if (preview) return tickets.filter(ticket => [ticket.ticketId, ticket.token, ticket.id, ticket.fullName].some(field => String(field || "").toLowerCase().includes(value.toLowerCase()))).slice(0, 8);
    if (role === "door-staff") {
      const { data, error } = await supabase.rpc("search_shs_gala_checkin_pass", { p_query: value });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(row => mapTicket(row));
    }
    return tickets.filter(ticket => [ticket.ticketId, ticket.token, ticket.id, ticket.fullName].some(field => String(field || "").toLowerCase().includes(value.toLowerCase()))).slice(0, 8);
  }, [preview, role, tickets]);

  const stats = useMemo(() => {
    const paid = tickets.filter(ticket => ticket.payment_status === "paid");
    const checked = tickets.filter(ticket => ticket.status === "Checked in");
    let revenue = tickets.reduce((sum, ticket) => sum + (ticket.order_id ? 0 : ticket.pricePaid), 0);
    const seenOrders = new Set();
    tickets.forEach(ticket => {
      if (ticket.order_id && !seenOrders.has(ticket.order_id)) {
        seenOrders.add(ticket.order_id);
        revenue += ticket.pricePaid;
      }
    });
    return {
      total: paid.reduce((sum, ticket) => sum + ticket.guestCount, 0),
      passes: tickets.length,
      checkedIn: checked.reduce((sum, ticket) => sum + ticket.guestCount, 0),
      expected: paid.filter(ticket => ticket.status === "Not checked in").reduce((sum, ticket) => sum + ticket.guestCount, 0),
      revenue,
    };
  }, [tickets]);

  return { tickets, event, role, loading, loadError, refresh, createTicket, checkIn, lookupPass, stats };
}
