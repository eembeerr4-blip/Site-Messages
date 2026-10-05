// A permanent alternate domain for networks that filter pages.dev.
// Secrets and Telegram delivery remain in the existing Pages Function.
const upstream = "https://date-invitation-7yx.pages.dev";
const publicOrigin = "https://date-invitation.makszagar001.workers.dev";
const assets = new Set(["/", "/index.html", "/style.css", "/script.js"]);

export async function proxy(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const isResponse = url.pathname === "/api/respond";
  if (url.origin !== publicOrigin) return new Response("Not found", { status: 404 });
  if (!isResponse && !assets.has(url.pathname)) return new Response("Not found", { status: 404 });
  if (isResponse ? request.method !== "POST" : !["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }
  if (isResponse && request.headers.get("Origin") !== publicOrigin) {
    return new Response("Forbidden", { status: 403 });
  }
  const headers = new Headers();
  for (const name of ["content-type", "origin", "sec-fetch-site", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const target = new URL(url.pathname + url.search, upstream);
  try {
    const response = await fetchImpl(target, {
      method: request.method, headers,
      ...(isResponse ? { body: request.body } : {}),
      redirect: "manual"
    });
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set("Cache-Control", "no-store, max-age=0");
    resultHeaders.set("X-Content-Type-Options", "nosniff");
    // Never send an upstream redirect that takes the visitor back to pages.dev.
    if (response.status >= 300 && response.status < 400) {
      return new Response("Upstream redirect unavailable", { status: 502 });
    }
    return new Response(response.body, { status: response.status, headers: resultHeaders });
  } catch {
    return new Response("Please try again shortly", { status: 503 });
  }
}

export default { fetch(request) { return proxy(request); } };
