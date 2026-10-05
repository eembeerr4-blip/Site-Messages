import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/script.js", "utf8");

export function fixture({ reduced = false, fetchImpl = async () => Response.json({ ok: true, delivered: true }) } = {}) {
  const nodes = new Map();
  const history = [];
  const requests = [];
  const warnings = [];
  const requestTimers = new Map();
  let timerID = 0;
  let document;
  function element(id) {
    const tag = html.match(new RegExp('<[^>]*\\bid="' + id + '"[^>]*>'))?.[0] || "";
    const el = {
      id, className: tag.match(/\bclass="([^"]*)"/)?.[1] || "", attrs: {}, dataset: {},
      hidden: /\bhidden\b/.test(tag), disabled: /\bdisabled\b/.test(tag), inert: false,
      children: [], events: {}, textContent: "", clientWidth: 260, clientHeight: 104,
      offsetWidth: 180, offsetHeight: 48, offsetTop: 200,
      style: { setProperty() {}, transform: "" },
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
      append(...values) { for (const v of values) this.children.push(...(v.fragment ? v.children : [v])); },
      replaceChildren() { this.children = []; },
      addEventListener(type, fn) { this.events[type] = fn; },
      focus() { document.activeElement = this; }, blur() { document.activeElement = null; },
      contains(v) { return Boolean(v) && this.focusedChild === v; },
      scrollTo(value) { this.lastScroll = value; },
      querySelector() { return element("heading"); },
      querySelectorAll(selector) {
        return this.children.filter((v) => selector === ".dot"
          ? v.classList.contains("dot") : v.classList.contains("particle") && !v.classList.contains("dot"));
      }
    };
    el.classList = {
      add(...values) {
        const classes = new Set(el.className.split(" ").filter(Boolean));
        values.forEach((v) => classes.add(v)); el.className = [...classes].join(" ");
        if (values.includes("active") && ["confirmation", "schedule", "final", "refusal", "invitation"].includes(id)) history.push(id);
      },
      remove(...values) { el.className = el.className.split(" ").filter((v) => !values.includes(v)).join(" "); },
      toggle(value, on) { if (on) this.add(value); else this.remove(value); },
      contains(value) { return el.className.split(" ").includes(value); }
    };
    return el;
  }
  document = {
    activeElement: null, title: "", body: element("body"),
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); },
    createElement: element,
    createDocumentFragment: () => Object.assign(element("fragment"), { fragment: true })
  };
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) document.getElementById(match[1]);
  const context = vm.createContext({
    document, crypto: globalThis.crypto,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ["2026-10-05T00:00:00Z"])); } },
    window: { PointerEvent() {}, matchMedia: () => ({ matches: reduced }), addEventListener() {} },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms) => {
      const id = ++timerID;
      if (ms >= 10000) requestTimers.set(id, fn); else queueMicrotask(fn);
      return id;
    },
    clearTimeout: (id) => requestTimers.delete(id),
    AbortController,
    fetch: (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); },
    console: { log() {}, warn: (v) => warnings.push(v), error: (v) => warnings.push(v) }
  });
  vm.runInContext(source, context);
  vm.runInContext('verificationToken="test-challenge"; window.turnstile={reset(){verificationToken="test-challenge";}}; widgetID=1; updateSelection();', context);
  return {
    nodes, context, history, requests, warnings, requestTimers,
    run: (code) => vm.runInContext(code, context),
    click: (id) => nodes.get(id).events.click(),
    pick: (date = "2026-10-23", time = "16:30") => vm.runInContext(`selectDate(${JSON.stringify(date)});selectTime(${JSON.stringify(time)})`, context),
    expire: () => { for (const fn of requestTimers.values()) fn(); }
  };
}
