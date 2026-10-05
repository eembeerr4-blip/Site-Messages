export const START_DATE = "2026-10-05";
export const END_DATE = "2026-10-31";
export const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function kyivToday(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const fields = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function validResponse(body, senderName) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (Object.keys(body).sort().join(",") !== "accepted,date,requestId,senderName,time,turnstileToken") return false;
  return body.accepted === true && body.senderName === senderName &&
    typeof body.date === "string" && /^2026-10-(0[5-9]|[12]\d|3[01])$/.test(body.date) &&
    typeof body.time === "string" && /^(?:1[0-7]:(?:00|30)|18:(?:00|30))$/.test(body.time) &&
    typeof body.requestId === "string" && REQUEST_ID.test(body.requestId) &&
    typeof body.turnstileToken === "string" && body.turnstileToken.length > 0 && body.turnstileToken.length <= 2048;
}
