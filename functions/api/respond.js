import { store } from "../../server/state.js";
import { validResponse, kyivToday, END_DATE } from "../../server/validation.js";
export { validResponse } from "../../server/validation.js";

const MAX_BODY_BYTES = 4096;
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const weekdays = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const json = (status, data, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", ...extra }
});
const fail = (status, error, extra) => json(status, { ok: false, error }, extra);
const delivered = () => json(200, { ok: true, delivered: true });

async function readBody(request) {
  if (!request.body) throw new Error("INVALID_BODY");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function checkedFetch(fetchImpl, url, body, milliseconds) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    return { response, answer: await response.json() };
  } finally { clearTimeout(timeout); }
}

export async function handleRespond(context, upstreamFetch = fetch, now = Date.now()) {
  const { request, env } = context;
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", { Allow: "POST" });
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const workerOrigin = "https://date-invitation.makszagar001.workers.dev";
  if (origin !== url.origin && !(url.hostname === "date-invitation-7yx.pages.dev" && origin === workerOrigin)) return fail(403, "ORIGIN_NOT_ALLOWED");
  const visitorHostname = new URL(origin).hostname;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin") return fail(403, "ORIGIN_NOT_ALLOWED");
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return fail(415, "JSON_REQUIRED");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) return fail(413, "BODY_TOO_LARGE");
  let body;
  try { body = await readBody(request); }
  catch (error) { return fail(error.message === "BODY_TOO_LARGE" ? 413 : 400, "INVALID_REQUEST"); }
  const senderName = typeof env.SENDER_NAME === "string" ? env.SENDER_NAME.trim() : "Максим";
  if (!senderName || senderName.length > 80 || /[\r\n\x00-\x1f]/.test(senderName)) return fail(503, "SERVICE_NOT_CONFIGURED");
  if (!validResponse(body, senderName)) return fail(400, "INVALID_SELECTION");
  if (!env.DB || typeof env.TURNSTILE_SECRET_KEY !== "string" || !env.TURNSTILE_SECRET_KEY.trim() ||
      typeof env.TELEGRAM_BOT_TOKEN !== "string" || !env.TELEGRAM_BOT_TOKEN.trim() ||
      typeof env.TELEGRAM_CHAT_ID !== "string" || !/^-?\d{1,20}$/.test(env.TELEGRAM_CHAT_ID)) return fail(503, "SERVICE_NOT_CONFIGURED");

  const storage = store(env.DB);
  const payloadHash = await hash(JSON.stringify({ accepted: true, date: body.date, time: body.time, senderName }));
  try {
    const previous = await storage.get(body.requestId);
    if (previous) {
      if (previous.payload_hash !== payloadHash) return fail(409, "REQUEST_CONFLICT");
      if (previous.status === "delivered") return delivered();
      if (previous.status === "uncertain") return fail(409, "DELIVERY_UNCERTAIN");
      if (previous.status === "pending") {
        if (now - previous.updated_at > 30000) {
          await storage.set(body.requestId, "uncertain", now);
          return fail(409, "DELIVERY_UNCERTAIN");
        }
        return fail(409, "REQUEST_PENDING", { "Retry-After": "5" });
      }
    }
    const today = kyivToday(now);
    if (today > END_DATE) return fail(410, "INVITATION_EXPIRED");
    if (body.date < today) return fail(400, "DATE_PASSED");

    // Secret-peppered hash: raw visitor IPs are never stored or logged.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const bucketStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const rateKey = await hash(`${env.TURNSTILE_SECRET_KEY}:${ip}:${bucketStart}`);
    const rate = await storage.rate(rateKey, bucketStart + WINDOW_MS);
    if (rate.count > LIMIT) return fail(429, "TRY_LATER", { "Retry-After": String(Math.ceil((bucketStart + WINDOW_MS - now) / 1000)) });
    if (context.waitUntil) context.waitUntil(storage.cleanup(now).catch(() => {}));

    let verification;
    try {
      verification = await checkedFetch(upstreamFetch, "https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken,
        ...(ip !== "unknown" ? { remoteip: ip } : {})
      }, 5000);
    } catch { return fail(503, "VERIFICATION_UNAVAILABLE"); }
    if (!verification.response.ok || verification.answer?.success !== true ||
        verification.answer.hostname !== visitorHostname || verification.answer.action !== "date_response") return fail(403, "VERIFICATION_FAILED");

    if (!(await storage.claim(body.requestId, payloadHash, now))) {
      const current = await storage.get(body.requestId);
      if (current?.payload_hash !== payloadHash) return fail(409, "REQUEST_CONFLICT");
      if (current?.status === "delivered") return delivered();
      return fail(409, current?.status === "uncertain" ? "DELIVERY_UNCERTAIN" : "REQUEST_PENDING", { "Retry-After": "5" });
    }

    const day = Number(body.date.slice(-2));
    const weekday = weekdays[new Date(Date.UTC(2026, 9, day)).getUTCDay()];
    const text = `Она согласилась ♡\nДата: ${weekday}, ${day} октября 2026 (${body.date})\nВремя: ${body.time} (Europe/Kyiv)\nОтправитель: ${senderName}`;
    try {
      // Telegram requires a token-bearing SERVER URL. It is never returned/logged.
      const result = await checkedFetch(upstreamFetch, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID, text
      }, 10000);
      if (result.answer?.ok === false) {
        await storage.set(body.requestId, "failed", now);
        return result.response.status === 429 || result.answer.error_code === 429
          ? fail(429, "TRY_LATER", { "Retry-After": "30" }) : fail(502, "DELIVERY_FAILED");
      }
      if (result.response.ok && result.answer?.ok === true && Number.isInteger(result.answer.result?.message_id)) {
        const saved = await storage.set(body.requestId, "delivered", now);
        if (saved.meta.changes !== 1) return fail(409, "DELIVERY_UNCERTAIN");
        return delivered();
      }
      await storage.set(body.requestId, "uncertain", now);
      return fail(409, "DELIVERY_UNCERTAIN");
    } catch {
      // A timeout may occur AFTER Telegram accepts the message. Never auto-resend.
      try { await storage.set(body.requestId, "uncertain", now); } catch {}
      return fail(409, "DELIVERY_UNCERTAIN");
    }
  } catch { return fail(503, "SERVICE_UNAVAILABLE"); }
}

export const onRequest = (context) => handleRespond(context);
