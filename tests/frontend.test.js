import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.js";

test("calendar weekdays, unavailable dates and one selected value", async () => {
  const f = fixture();
  assert.equal(f.nodes.get("greeting").textContent, "У меня к тебе серьёзный вопрос");
  assert.equal(f.run("dateButtons.size"), 31);
  const days = ["Чт", "Пт", "Сб", "Вс", "Пн", "Вт", "Ср"];
  for (let day = 1; day <= 31; day++) {
    const button = f.run(`dateButtons.get('2026-10-${String(day).padStart(2, "0")}')`);
    assert.equal(button.children[1].textContent, days[(day - 1) % 7]);
    assert.equal(button.disabled, day < 5);
  }
  await Promise.all([f.click("yes"), f.click("yes")]);
  assert.equal(f.run("state.screen"), "schedule");
  assert.equal(f.nodes.get("confirm").disabled, true);
  f.pick("2026-10-04", "09:30");
  assert.equal(f.run("selectedDate"), null);
  assert.equal(f.run("selectedTime"), null);
  for (let day = 5; day <= 31; day++) {
    f.run(`selectDate('2026-10-${String(day).padStart(2, "0")}')`);
    assert.equal(f.run('[...dateButtons.values()].filter(b=>b.attrs["aria-pressed"]==="true").length'), 1);
  }
  const times = Array.from({ length: 18 }, (_, i) => `${10 + Math.floor(i / 2)}:${i % 2 ? "30" : "00"}`);
  assert.deepEqual(JSON.parse(f.run("JSON.stringify(timeOptions)")), times);
  for (const time of times) {
    f.run(`selectTime('${time}')`);
    assert.equal(f.run(' [...timeButtons.values()].filter(b=>b.attrs["aria-pressed"]==="true").length'), 1);
  }
  assert.equal(f.nodes.get("confirm").disabled, false);
  assert.equal(f.nodes.get("time-section").hidden, false);
  assert.equal(f.requests.length, 0);
});

test("final only after confirmed response; pending locks selection and duplicate requests", async () => {
  let resolve;
  const f = fixture({ fetchImpl: () => new Promise((r) => { resolve = r; }) });
  await f.click("yes");
  await f.click("confirm"); // missing selection must not send anything
  assert.equal(f.requests.length, 0);
  f.pick();
  const pending = f.click("confirm");
  await f.click("confirm");
  assert.equal(f.requests.length, 1);
  assert.equal(f.run("state.screen"), "schedule");
  assert.equal(f.nodes.get("final").hidden, true);
  assert.equal(f.nodes.get("confirm").disabled, true);
  assert(f.run("[...timeButtons.values()].every(b=>b.disabled)"));
  f.pick("2026-10-25", "18:00");
  assert.equal(f.run("selectedDate"), "2026-10-23");
  assert.equal(f.run("selectedTime"), "16:30");
  const request = f.requests[0];
  assert.equal(request.url, "/api/respond");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.cache, "no-store");
  const sentBody = JSON.parse(request.options.body);
  assert.match(sentBody.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(sentBody.turnstileToken, "test-challenge");
  delete sentBody.requestId; delete sentBody.turnstileToken;
  assert.deepEqual(sentBody, { accepted: true, date: "2026-10-23", time: "16:30", senderName: "Максим" });
  resolve(Response.json({ ok: true, delivered: true }));
  await pending;
  assert.deepEqual(f.history, ["confirmation", "schedule", "final"]);
  assert.equal(f.nodes.get("date").textContent, "Пятница, 23 октября");
  assert.equal(f.nodes.get("time").textContent, "16:30");
  assert.equal(f.run("window.responseData === responseData"), true);
  assert.deepEqual(JSON.parse(f.run("JSON.stringify(responseData)")), sentBody);
  assert.equal(f.requestTimers.size, 0);
  assert.deepEqual(f.warnings, []);
});

test("failure keeps date/time and screen; retry succeeds without claiming exactly-once", async () => {
  const failures = [
    async () => Response.json({ ok: false }, { status: 503 }),
    async () => Response.json({ ok: false }, { status: 429 }),
    async () => Response.json({ ok: true, delivered: false }),
    async () => new Response("<html>old cached page</html>"),
    async () => { throw new Error("Offline"); }
  ];
  for (const failure of failures) {
    let first = true;
    const f = fixture({ fetchImpl: (...args) => first ? failure(...args) : Response.json({ ok: true, delivered: true }) });
    await f.click("yes"); f.pick(); await f.click("confirm");
    assert.equal(f.run("state.screen"), "schedule");
    assert.equal(f.nodes.get("final").hidden, true);
    assert.equal(f.nodes.get("submit-status").hidden, false);
    assert.equal(f.nodes.get("confirm").disabled, false);
    assert.equal(f.run("selectedDate"), "2026-10-23");
    assert.equal(f.run("selectedTime"), "16:30");
    assert(f.run("[...dateButtons.entries()].filter(([date])=>!validDate(date)).every(([,b])=>b.disabled)"));
    first = false;
    await f.click("confirm");
    assert.equal(f.run("state.screen"), "final");
    assert.equal(f.requests.length, 2);
  }
});

test("request timeout restores retry; missing modern API does not strand busy state", async () => {
  const f = fixture({ fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")))) });
  await f.click("yes"); f.pick();
  const pending = f.click("confirm"); f.expire(); await pending;
  assert.equal(f.run("state.screen"), "schedule");
  assert.equal(f.nodes.get("confirm").disabled, false);
  assert.equal(f.run("state.busy"), false);
  const legacy = fixture();
  await legacy.click("yes"); legacy.pick();
  legacy.run("AbortController=undefined");
  await legacy.click("confirm");
  assert.equal(legacy.run("state.busy"), false);
  assert.equal(legacy.nodes.get("submit-status").hidden, false);
});

test("accessible refusal and return work for pointer, keyboard and old touch click", async () => {
  for (const mode of ["pointer", "keyboard", "legacy"]) {
    const f = fixture();
    if (mode === "legacy") f.run("delete window.PointerEvent");
    const no = f.nodes.get("no");
    for (let i = 1; i <= 4; i++) {
      if (mode === "pointer") {
        no.events.pointerdown({ button: 0, preventDefault() {} });
        no.events.click({ detail: 1, preventDefault() {} });
      } else no.events.click({ detail: mode === "keyboard" ? 0 : 1, preventDefault() {} });
      assert.equal(f.run("state.attempts"), i);
      const [x, y] = no.style.transform.match(/\d+/g).map(Number);
      assert(x >= 0 && x + 180 <= 260 && y >= 0 && y + 48 <= 104);
    }
    no.events.click({ detail: 0, preventDefault() {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.run("state.screen"), "refusal");
    await f.click("back");
    assert.equal(f.run("state.screen"), "invitation");
    assert.equal(f.run("state.attempts"), 4);
  }
});

test("reduced-motion flow stays functional and keeps no heart burst", async () => {
  const f = fixture({ reduced: true });
  await f.click("yes"); f.pick("2026-10-05", "10:00"); await f.click("confirm");
  assert.equal(f.run("state.screen"), "final");
  assert.equal(f.nodes.get("date").textContent, "Понедельник, 5 октября");
  assert.equal(f.nodes.get("time").textContent, "10:00");
  assert.equal(f.nodes.get("burst").children.length, 0);
});


test("missing verification prevents requests; expired range disables every date", async () => {
 const f=fixture(); await f.click("yes"); f.pick(); f.run('verificationToken="";updateSelection()');
 assert.equal(f.nodes.get("confirm").disabled,true); await f.click("confirm"); assert.equal(f.requests.length,0);
 f.run('todayKyiv=()=>"2026-11-01";setSending(false);updateSelection()');
 assert(f.run('[...dateButtons.values()].every(b=>b.disabled)'));
 assert.equal(f.nodes.get("confirm").disabled,true);
});

test("same choice retry retains its idempotency key and responseData has four fields", async () => {
 const f=fixture({fetchImpl:async()=>Response.json({ok:false,error:"DELIVERY_FAILED"},{status:502})});
 await f.click("yes");f.pick();await f.click("confirm");await f.click("confirm");
 assert.equal(JSON.parse(f.requests[0].options.body).requestId,JSON.parse(f.requests[1].options.body).requestId);
 assert.deepEqual(JSON.parse(f.run('JSON.stringify(Object.keys(responseData).sort())')),['accepted','date','senderName','time']);
});
