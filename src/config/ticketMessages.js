const messages = [
  "your place is set for something special.",
  "the evening feels brighter with you in it.",
  "come for the elegance; stay for the memories.",
  "celebrating care is better with you here.",
  "your style belongs in this story.",
  "an evening of purpose, polished just for you.",
  "bring your boldest self; we saved you a seat.",
  "you make this community worth celebrating.",
  "here’s to care, connection, and a little glamour.",
  "an unforgettable evening starts with you.",
  "your presence completes the occasion.",
  "grace, good company, and a place for you.",
  "you are part of what makes SHS shine.",
  "a special seat for someone who makes a difference.",
  "step into the evening as only you can.",
  "the celebration is more meaningful with you.",
  "dress with feeling; arrive with confidence.",
  "this gathering is better because you’re part of it.",
  "here’s a little space for your big entrance.",
  "elegance has many forms. Yours is welcome here.",
  "your next gala memory begins here.",
  "come celebrate the hands and hearts of SHS.",
  "we’ve made room for your unmistakable style.",
  "a touch of white, a whole lot of you.",
  "you bring the spark to this shared celebration.",
  "a night made for connection, courage, and you.",
  "the best details include your name.",
  "you belong in every brilliant moment ahead.",
  "let your confidence take center stage.",
  "here’s to a gathering as thoughtful as you are.",
  "your contribution deserves a beautiful celebration.",
  "good company looks even better with you.",
  "join the celebration of those who care.",
  "take your seat in a night to remember.",
  "your presence is a gift to this community.",
  "made for remarkable people like you.",
  "celebrate your path, your people, your style.",
  "the evening is yours to enjoy.",
  "a graceful night, a welcoming place for you.",
  "your energy makes every room more alive.",
  "come ready for warmth, wonder, and connection.",
  "the gala has saved its brightest detail for you.",
  "there’s a place here for your kind of brilliance.",
  "let the evening reflect the care you give.",
  "good things happen when our community gathers.",
  "you’re invited to make this moment your own.",
  "your story adds something special to SHS.",
  "wear what feels like you; the night awaits.",
  "this is your moment to celebrate and be celebrated.",
  "with you here, the occasion is complete."
];
export function getTicketWelcomeMessage(ticket) {
  const first = String(ticket.fullName || "Guest").trim().split(/\s+/)[0] || "Guest";
  const match = String(ticket.ticketId || "").match(/(\d+)$/);
  const hash = [...String(ticket.token || ticket.id || first)].reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    7
  );
  const index = match ? (Number(match[1]) - 1) % messages.length : hash % messages.length;
  return `${first}, ${messages[index]}`;
}
