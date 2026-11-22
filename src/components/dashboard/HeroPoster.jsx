import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const posterImage = "/images/shs-gala-poster.jpeg";

export default function HeroPoster({ event }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (keyboardEvent) => {
      if (keyboardEvent.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <div className="hero-poster-area">
        <button
          ref={triggerRef}
          type="button"
          className="hero-poster-ticket"
          onClick={() => setOpen(true)}
          aria-label="Open the full gala poster"
          title="Open full poster"
        >
          <img className="hero-poster-image" src={posterImage} alt="School of Health Sciences Annual Gala poster, theme Healing Hands, Elegant Hearts" />
          <span className="hero-poster-perforation" aria-hidden="true" />
          <span className="hero-poster-notch hero-poster-notch-left" aria-hidden="true" />
          <span className="hero-poster-notch hero-poster-notch-right" aria-hidden="true" />
          <span className="hero-poster-stub">
            <strong>ADMIT</strong>
            <span>{event.shortDate || "Week 12 · Friday · Date TBC"}</span>
            <span>{event.venue || "Venue not set"}</span>
          </span>
        </button>
      </div>

      {open && (
        <div className="hero-poster-lightbox" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && setOpen(false)}>
          <section className="hero-poster-dialog" role="dialog" aria-modal="true" aria-labelledby="hero-poster-dialog-title">
            <h2 id="hero-poster-dialog-title" className="sr-only">Gala poster</h2>
            <button ref={closeRef} className="hero-poster-close" type="button" onClick={() => setOpen(false)} aria-label="Close poster"><X size={22} /></button>
            <img src={posterImage} alt="Full School of Health Sciences Annual Gala poster" />
          </section>
        </div>
      )}
    </>
  );
}
