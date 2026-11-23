import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Search, ShieldCheck, TicketCheck, X, ScanLine } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

export default function CheckInPage({ tickets, result, setResult, checkIn, lookupPass, role }) {
  const [value, setValue] = useState("");
  const doorStaff = role === "door-staff";
  const find = useCallback(async raw => {
    const key = String(raw).trim();
    if (!key) return;
    try {
      const matches = await lookupPass(key);
      if (!matches.length) {
        setResult({ ok: false, message: "No pass found. Check the guest name or ticket code and try again." });
        return;
      }
      if (matches.length > 1) {
        setResult({ ok: false, message: "More than one guest matches. Scan the QR code or enter the guest’s ticket code." });
        return;
      }
      await checkIn(matches[0]);
    } catch (error) {
      setResult({ ok: false, message: error.message || "Could not look up this pass." });
    }
  }, [lookupPass, setResult, checkIn]);
  const submit = event => { event.preventDefault(); find(value); };
  const waiting = tickets.filter(ticket => ticket.status === "Not checked in" && ["confirmed", "paid"].includes(ticket.payment_status));

  return <section className="page-enter">
    <div className="page-kicker"><span>GALA OPERATIONS</span><i/> CHECK-IN</div>
    <div className="page-heading-row">
      <div><h1>Guest check-in</h1><p>{doorStaff ? "Scan a guest pass or search by name or ticket code." : "Scan a QR pass or search by name or ticket code."}</p></div>
      {!doorStaff && <div className="total-tile"><small>READY TO ARRIVE</small><b>{waiting.reduce((sum, ticket) => sum + ticket.guestCount, 0)}</b><span>admissions awaiting check-in</span></div>}
    </div>
    <div className="checkin-page">
      <section className="checkin-card">
        <div className="section-label"><span>VERIFY ADMISSION</span></div>
        <h2>Find a pass</h2>
        <p>Enter a guest name or ticket code, or use the camera scanner.</p>
        <form className="checkin-form" onSubmit={submit}><input value={value} onChange={event => setValue(event.target.value)} placeholder="Guest name or ticket code" aria-label="Guest name or ticket code"/><button type="submit"><Search size={15}/> Verify</button></form>
        <CameraScanner onDecoded={find}/>
        {result ? <div className={"checkin-result " + (result.ok ? "ok" : "error")}><div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>{result.ok ? <CheckCircle2 size={18}/> : <X size={18}/>}<div><b>{result.ok ? "ACCESS GRANTED" : "CHECK-IN FAILED"}</b><p>{result.ticket ? `${result.ticket.fullName} · ${result.ticket.ticketId} — ` : ""}{result.message}</p></div><button style={{ marginLeft: "auto", border: 0, background: "none" }} onClick={() => { setResult(null); setValue(""); }} aria-label="Dismiss"><X size={14}/></button></div></div> : <div className="checkin-result" style={{ background: "#f7f7f4", color: "#777" }}><TicketCheck size={18}/> Ready for the next guest</div>}
        {!doorStaff && <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 16, fontSize: 10, color: "#777", display: "flex", justifyContent: "space-between" }}><span>Admissions checked in</span><b>{tickets.filter(ticket => ticket.status === "Checked in").reduce((sum, ticket) => sum + ticket.guestCount, 0)}</b></div>}
      </section>
      <aside className="checkin-side">
        {doorStaff ? <><div className="section-label"><span>DOOR STAFF</span></div><h2>Individual pass scan</h2><p>Each guest has a separate QR pass. A scan admits one person.</p><div style={{ marginTop: 16, padding: 13, borderRadius: 9, background: "#f5f5f2", fontSize: 10, lineHeight: 1.6, color: "#666", display: "flex", gap: 8 }}><ShieldCheck size={16} style={{ flex: "none" }}/><span>Payment details and the full guest list are hidden from door staff.</span></div></> : <><div className="section-label"><span>QUICK ADMIT</span></div><h2>Payment confirmed</h2><p>Use quick admit if you already have the guest’s pass in hand.</p>{waiting.slice(0, 8).map(ticket => <div className="quick-row" key={ticket.id}><span className="pass-avatar">{String(ticket.fullName || "?").slice(0, 1).toUpperCase()}</span><b>{ticket.fullName}<small style={{ display: "block", fontWeight: 400, color: "#888", marginTop: 3 }}>{ticket.ticketId} · {ticket.guestCount} {ticket.guestCount === 1 ? "guest" : "guests"}</small></b><button onClick={() => checkIn(ticket)}>Admit</button></div>)}{waiting.length === 0 && <div className="table-empty">No confirmed passes waiting.</div>}<div style={{ marginTop: 16, padding: 13, borderRadius: 9, background: "#f5f5f2", fontSize: 10, lineHeight: 1.6, color: "#666", display: "flex", gap: 8 }}><ShieldCheck size={16} style={{ flex: "none" }}/><span><b>One scan per guest.</b> Each person in a group has a separate pass.</span></div></>}
      </aside>
    </div>
  </section>;
}

function CameraScanner({ onDecoded }) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    let scanner, cancelled = false;
    (async () => {
      try {
        scanner = new Html5Qrcode("shs-gala-qr-reader");
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 180 } }, async text => {
          if (cancelled) return;
          cancelled = true;
          try { await scanner.stop(); } catch {}
          onDecoded(text);
          setOpen(false);
        });
      } catch {
        setMessage("Camera unavailable or permission denied. Enter the guest name or ticket code instead.");
        setOpen(false);
      }
    })();
    return () => { cancelled = true; if (scanner?.isScanning) scanner.stop().catch(() => {}); };
  }, [open, onDecoded]);
  return <div style={{ marginTop: 12 }}><button type="button" className="scan-button" onClick={() => { setMessage(""); setOpen(value => !value); }}><ScanLine size={15}/>{open ? "Close camera" : "Open camera scanner"}</button>{message && <p style={{ color: "#8a5a00", fontSize: 10, marginTop: 8 }}>{message}</p>}{open && <div id="shs-gala-qr-reader" style={{ marginTop: 12, maxWidth: 390, overflow: "hidden", borderRadius: 10, border: "1px solid #ddd" }}/>}</div>;
}
