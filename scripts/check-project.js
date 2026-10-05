import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { Script, runInNewContext } from "node:vm";

export function checkProject() {
  for (const file of ["public/index.html", "public/style.css", "public/script.js", "public/_headers", "public/_routes.json", "functions/api/respond.js", "wrangler.toml", ".gitignore", ".dev.vars.example"]) {
    assert(existsSync(file), `Missing ${file}`);
  }
  const html = readFileSync("public/index.html", "utf8");
  const js = readFileSync("public/script.js", "utf8");
  const css = readFileSync("public/style.css", "utf8");
  new Script(js);
  const config = runInNewContext(js.match(/^const CONFIG = (\{[\s\S]*?\});/)[0] + "\nCONFIG");
  const sender = JSON.parse(readFileSync("wrangler.toml", "utf8").match(/^SENDER_NAME\s*=\s*(".*")$/m)[1]);
  assert.equal(config.senderName, sender, "CONFIG.senderName must match server SENDER_NAME");
  assert(readFileSync("wrangler.toml", "utf8").includes('pages_build_output_dir = "./public"'));
  assert(html.includes('style.css?v=20261005-telegram-2'));
  assert(html.includes('script.js?v=20261005-telegram-2'));
  assert(readFileSync("public/_headers", "utf8").includes("Cache-Control: no-store"));
  assert.deepEqual(JSON.parse(readFileSync("public/_routes.json", "utf8")).include, ["/api/respond"]);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of js.matchAll(/\$\("([^"]+)"\)/g)) assert(ids.includes(match[1]), `Missing ${match[1]}`);
  for (const match of html.matchAll(/\b(?:aria-labelledby|href)="#?([^"]+)"/g)) {
    const reference = match[1];
    if (reference.startsWith("data:")) continue;
    if (reference.includes(".css")) assert(existsSync("public/" + reference.split("?")[0]));
    else assert(ids.includes(reference));
  }
  const publicSource = html + js + css;
  assert(!/\?{3,}/.test(publicSource), "Corrupted interface text");
  assert(!/\.ics|BEGIN:VCALENDAR|Добавить в календарь|Открой в календаре|Письмо уже в пути|letter-status|envelope-idle/.test(publicSource));
  assert(!/TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|api\.telegram\.org/.test(publicSource));
  assert(!/\d{6,}:[A-Za-z0-9_-]{25,}/.test(publicSource));
  assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/i.test(html));
  assert(readFileSync(".gitignore", "utf8").includes(".dev.vars"));
  assert.equal(readFileSync(".dev.vars.example", "utf8").trim(), "TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\nTURNSTILE_SECRET_KEY=");
}

if (process.argv[1]?.endsWith("check-project.js")) {
  checkProject();
  console.log("Project structure, asset versions, API route and public source checks passed.");
}
