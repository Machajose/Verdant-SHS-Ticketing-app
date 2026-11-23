import { useMemo, useState } from "react";
import { Download, Plus, Ticket, Trash2, X } from "lucide-react";
import { formatMoney } from "../../config/event.js";
import StatusBadge from "../ui/StatusBadge.jsx";
import TicketArtwork from "./TicketArtwork.jsx";
import { getTicketWelcomeMessage } from "../../config/ticketMessages.js";
import { downloadTicketArtwork } from "./downloadTicketArtwork.js";

const departments = ["Medical Laboratory Sciences", "Nursing", "Clinical Medicine", "Public Health", "Community Health"];
const packageSizes = { single: 1, couple: 2, group_3: 3, group_5: 5 };
const packageNames = { single: "Single", couple: "Couple", group_3: "Group of 3", group_5: "Group of 5" };

export function IssueTicketModal({ event, onClose, onCreate, onCreated, initialDepartment }) {
  const [packageType, setPackageType] = useState("single");
  const [amountDue, setAmountDue] = useState(String(event.price));
  const [phone, setPhone] = useState("");
  const [attendees, setAttendees] = useState([{ fullName: "", department: initialDepartment || "Nursing" }]);
  const [payments, setPayments] = useState([{ mpesaCode: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const expectedCount = packageSizes[packageType];
  const totalReceived = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments]);

  function updateType(type) {
    const nextCount = packageSizes[type];
    setPackageType(type);
    setAttendees(current => Array.from({ length: nextCount }, (_, index) => current[index] || { fullName: "", department: initialDepartment || "Nursing" }));
    setAmountDue(type === "single" ? String(event.price) : type === "couple" ? String(Number(event.price) * 2 - 150) : "");
  }
  function updateAttendee(index, key, value) {
    setAttendees(current => current.map((attendee, i) => i === index ? { ...attendee, [key]: value } : attendee));
  }
  function updatePayment(index, key, value) {
    setPayments(current => current.map((payment, i) => i === index ? { ...payment, [key]: value } : payment));
  }
  function addPayment() { setPayments(current => [...current, { mpesaCode: "", amount: "" }]); }
  function removePayment(index) { setPayments(current => current.filter((_, i) => i !== index)); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const due = Number(amountDue);
      const usedPayments = payments.filter(payment => payment.mpesaCode.trim() || payment.amount);
      const cleanPayments = usedPayments.map(payment => ({ mpesaCode: payment.mpesaCode.trim().toUpperCase(), amount: Number(payment.amount) }));
      const references = cleanPayments.map(payment => payment.mpesaCode);
      if (attendees.some(attendee => attendee.fullName.trim().length < 2)) throw new Error("Enter the full name of each guest.");
      if (new Set(references).size !== references.length) throw new Error("Each M-Pesa transaction code must be different.");
      if (!Number.isFinite(due) || due <= 0) throw new Error("Enter the agreed total price for this pass.");
      if (cleanPayments.some(payment => payment.mpesaCode.length < 6 || !Number.isFinite(payment.amount) || payment.amount <= 0)) throw new Error("Complete both the M-Pesa code and amount for each payment, or leave both blank.");
      if (totalReceived > due) throw new Error("The amount recorded cannot be more than the package total.");
      if (cleanPayments.length && !verified) throw new Error("Verify the recorded M-Pesa transactions before saving.");
      const created = await onCreate({ packageType, amountDue: due, attendees: attendees.map(a => ({ ...a, fullName: a.fullName.trim() })), phone: phone.trim(), payments: cleanPayments });
      onCreated(created);
    } catch (err) {
      setError(err.message || "Could not issue the passes.");
    } finally {
      setBusy(false);
    }
  }

  const coupleTotal = formatMoney(Number(event.price) * 2 - 150, event.currency);
  return <div className="ticket-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="ticket-modal-card issue-modal" role="dialog" aria-modal="true" aria-labelledby="issue-title">
      <header className="ticket-modal-header"><div>
        <span className="ticket-modal-kicker">{packageNames[packageType]} · {expectedCount} {expectedCount === 1 ? "pass" : "individual passes"}</span>
        <h2 id="issue-title">Issue admission passes</h2>
        <p>Each guest gets a named pass and a separate QR code.</p>
      </div><button onClick={onClose} aria-label="Close"><X size={18}/></button></header>
      <form onSubmit={submit} className="ticket-form">
        <Field label="Admission package"><select value={packageType} onChange={e => updateType(e.target.value)} className="form-input">
          <option value="single">Single guest</option><option value="couple">Couple · 2 guests</option><option value="group_3">Group of 3</option><option value="group_5">Group of 5</option>
        </select></Field>
        <Field label={packageType === "single" ? "Package total (KES) · estimate" : packageType === "couple" ? "Couple total (KES) · estimate" : "Agreed package total (KES)"}>
          <input required type="number" min="1" step="1" value={amountDue} onChange={e => setAmountDue(e.target.value)} className="form-input"/>
        </Field>
        {packageType === "couple" && <p className="ticket-form-note">Estimated from two KES 900 admissions, less KES 150: {coupleTotal}. Update the total if the committee confirms a different solo price.</p>}
        {packageType === "single" && <p className="ticket-form-note">The solo price is currently an estimate. Confirm it with the committee.</p>}
        {packageType.startsWith("group_") && <p className="ticket-form-note">Group pricing has not been set. Enter the agreed package total.</p>}
        <section className="purchase-guests" aria-label="Guests receiving individual passes"><h3>Guests · {expectedCount}</h3>
          {attendees.map((attendee, index) => <div className="purchase-guest" key={index}>
            <span className="purchase-guest-number">Pass {index + 1}</span>
            <Field label="Guest full name"><input required minLength="2" value={attendee.fullName} onChange={e => updateAttendee(index, "fullName", e.target.value)} placeholder="Full name" className="form-input"/></Field>
            <Field label="Department"><select required value={attendee.department} onChange={e => updateAttendee(index, "department", e.target.value)} className="form-input">{departments.map(department => <option key={department}>{department}</option>)}</select></Field>
          </div>)}
        </section>
        <Field label="Contact phone for this purchase"><input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" className="form-input"/></Field>
        <section className="purchase-payments" aria-label="Payment transactions"><div className="purchase-payment-heading"><h3>Payment transactions</h3><button type="button" className="payment-add-button" onClick={addPayment}><Plus size={14}/> Add transaction</button></div>
          {payments.map((payment, index) => <div className="form-grid purchase-payment" key={index}>
            <Field label={`M-Pesa code ${index + 1}`}><input minLength="6" maxLength="12" value={payment.mpesaCode} onChange={e => updatePayment(index, "mpesaCode", e.target.value.toUpperCase())} placeholder="Enter if payment received" className="form-input font-mono uppercase"/></Field>
            <Field label="Amount received (KES)"><span className="payment-amount-wrap"><input type="number" min="1" step="1" value={payment.amount} onChange={e => updatePayment(index, "amount", e.target.value)} className="form-input"/>{(payments.length > 1 || index === 0) && <button type="button" onClick={() => removePayment(index)} aria-label={`Remove payment ${index + 1}`}><Trash2 size={15}/></button>}</span></Field>
          </div>)}
          <div className="purchase-total"><span>Received</span><strong>{formatMoney(totalReceived, event.currency)}</strong><span>Due: {formatMoney(Number(amountDue) || 0, event.currency)} · Balance: {formatMoney(Math.max(0, (Number(amountDue) || 0) - totalReceived), event.currency)}</span></div>
        </section>
        <p className="ticket-form-note">Passes remain pending and cannot be checked in until the full balance is paid. Add later payments from the pass details.</p>
        {totalReceived > 0 && <label className="payment-check"><input required type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)}/><span>I have verified these M-Pesa transactions.</span></label>}
        {error && <p role="alert" className="ticket-error">{error}</p>}
        <footer className="ticket-form-footer"><span>{expectedCount} guests · {payments.length} {payments.length === 1 ? "transaction" : "transactions"}</span><button disabled={busy} className="ticket-submit"><Ticket size={15}/>{busy ? "Creating passes…" : "Create individual passes"}</button></footer>
      </form>
    </section>
  </div>;
}

export function TicketPreviewModal({ event, ticket, onClose, onRecordPayment }) {
  const [downloading, setDownloading] = useState(false), message = getTicketWelcomeMessage(ticket);
  const [mpesaCode, setMpesaCode] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  async function downloadTicket() { setDownloading(true); try { await downloadTicketArtwork(event, ticket, message); } catch (error) { console.error("Ticket download failed", error); } finally { setDownloading(false); } }
  async function savePayment(e) { e.preventDefault(); setSaving(true); setPaymentError(""); try { await onRecordPayment(ticket, { mpesaCode, amount: Number(amount) }); setMpesaCode(""); setAmount(""); } catch (error) { setPaymentError(error.message || "Could not record the payment."); } finally { setSaving(false); } }
  return <div className="ticket-overlay ticket-preview-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="ticket-modal-card ticket-preview-card" role="dialog" aria-modal="true" aria-labelledby="ticket-preview-title"><header className="ticket-preview-header"><div><span className="ticket-modal-kicker">{event.name} · INDIVIDUAL ADMISSION</span><h2 id="ticket-preview-title">{ticket.ticketId}</h2></div><button onClick={onClose} aria-label="Close ticket preview"><X size={18}/></button></header><div className="ticket-preview-content"><TicketArtwork event={event} ticket={ticket} message={message}/><div className="ticket-preview-actions"><div><small>ADMISSION STATUS</small><StatusBadge status={ticket.status} paymentStatus={ticket.payment_status}/></div><button onClick={downloadTicket} disabled={downloading} className="ticket-submit download-button"><Download size={16}/>{downloading ? "Preparing…" : "Download pass"}</button></div>{ticket.order_id && <section className="balance-panel"><h3>Purchase balance</h3><p>Received <strong>{formatMoney(ticket.amountReceived || 0, event.currency)}</strong><span>Balance <strong>{formatMoney(ticket.balanceDue ?? ticket.amountDue ?? 0, event.currency)}</strong></span></p>{ticket.paymentRecords?.length > 0 && <ul className="payment-history">{ticket.paymentRecords.map((payment, index) => <li key={`${payment.mpesa_code}-${index}`}><span>{payment.mpesa_code} · {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : "Recorded"}</span><strong>{formatMoney(payment.amount, event.currency)}</strong></li>)}</ul>}{ticket.payment_status !== "paid" && <form onSubmit={savePayment} className="record-payment-form"><Field label="New M-Pesa transaction code"><input required minLength="6" maxLength="12" value={mpesaCode} onChange={e => setMpesaCode(e.target.value.toUpperCase())} className="form-input font-mono uppercase"/></Field><Field label="Amount received (KES)"><input required type="number" min="1" max={ticket.balanceDue || undefined} step="1" value={amount} onChange={e => setAmount(e.target.value)} className="form-input"/></Field><button className="ticket-submit" disabled={saving}>{saving ? "Recording…" : "Record payment"}</button></form>}{paymentError && <p role="alert" className="ticket-error">{paymentError}</p>}</section>}</div></section></div>;
}

function Field({ label, children }) { return <label className="ticket-field"><span>{label}</span>{children}</label>; }
