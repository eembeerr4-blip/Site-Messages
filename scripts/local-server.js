// Dependency-free local adapter for the actual Pages handler; never mocks success.
// Use Wrangler for final Cloudflare runtime verification when it is available.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { handleRespond } from "../functions/api/respond.js";

const root = path.resolve("public");
const env = { SENDER_NAME: "Максим" };
try {
  const settings = await readFile("wrangler.toml", "utf8");
  env.SENDER_NAME = JSON.parse(settings.match(/^SENDER_NAME\s*=\s*(".*")$/m)[1]);
  const vars = await readFile(".dev.vars", "utf8");
  for (const line of vars.split(/\r?\n/)) {
    const match = line.match(/^\s*(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|SENDER_NAME)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw new Error("Invalid local configuration");
}
for (const key of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "SENDER_NAME"]) {
  if (process.env[key]) env[key] = process.env[key];
}

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://${incoming.headers.host || "localhost:8080"}`);
    if (url.pathname === "/api/respond") {
      const options = { method: incoming.method, headers: incoming.headers };
      if (incoming.method !== "GET" && incoming.method !== "HEAD") {
        options.body = Readable.toWeb(incoming);
        options.duplex = "half";
      }
      const result = await handleRespond({ request: new Request(url, options), env });
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (incoming.method !== "GET" && incoming.method !== "HEAD") {
      outgoing.writeHead(405); outgoing.end(); return;
    }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep) || path.basename(file).startsWith("_")) {
      outgoing.writeHead(404); outgoing.end(); return;
    }
    if (!(await stat(file)).isFile()) { outgoing.writeHead(404); outgoing.end(); return; }
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
    outgoing.writeHead(200, {
      "Content-Type": (types[path.extname(file)] || "application/octet-stream") + "; charset=utf-8",
      "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY"
    });
    outgoing.end(incoming.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    outgoing.writeHead(404); outgoing.end();
  }
});
server.listen(Number(process.env.PORT || 8080), "0.0.0.0", () => {
  console.log(`Приглашение на свидание: http://localhost:${server.address().port}`);
  console.log("Local Pages adapter. Telegram requires server secrets; no simulated delivery.");
});
