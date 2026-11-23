export default function TicketArtwork({event,ticket,message}) {
  return <article className="ticket-artwork" aria-label={event.name+" admission ticket"}>
    <section className="ticket-face">
      <div className="ticket-pattern" aria-hidden="true"/>
      <div className="ticket-event-heading">
        <span className="ticket-university">MURANG’A UNIVERSITY OF TECHNOLOGY</span>
        <span className="ticket-school">SCHOOL OF HEALTH SCIENCES</span>
        <h2>Annual Gala</h2>
        <p>HEALING HANDS · ELEGANT HEARTS</p>
      </div>
      <div className="ticket-guest-panel">
        <div className="ticket-eyebrow">{ticket.department} <i/> {ticket.ticketType} <i/> {ticket.ticketId}</div>
        <h3>{ticket.fullName}</h3>
        <p>{ticket.guestCount>1?`Group admission · ${ticket.guestCount} guests · `:""}{message}</p>
        {ticket.payment_status !== "paid" && <div className="ticket-pending-mark">PAYMENT PENDING · NOT VALID FOR ENTRY</div>}
      </div>
    </section>
    <aside className="ticket-stub">
      <span className="ticket-stub-kicker">ADMISSION PASS</span>
      <div className="ticket-qr-frame"><img src={ticket.qr} alt={"QR code for ticket "+ticket.ticketId}/></div>
      <strong>SCAN TO VERIFY</strong>
      <span className="ticket-stub-code">{ticket.ticketId}</span>
      <span className="ticket-stub-count">{ticket.guestCount} {ticket.guestCount===1?"ADMISSION":"ADMISSIONS"}</span>
    </aside>
  </article>;
}
