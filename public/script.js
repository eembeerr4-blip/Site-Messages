const CONFIG = {
  senderName: "Максим",
  girlName: "",
  turnstileSiteKey: "0x4AAAAAAFOI7mOSW4PzFj7n"
};

const $ = (id) => document.getElementById(id);
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = { screen: "invitation", busy: false, attempts: 0, position: 0 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Selection stays in memory; only confirmation posts the fixed response schema.
let verificationToken = "";
let widgetID;
let submissionID;
let submissionKey;
function todayKyiv() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Kyiv",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const part = (name) => parts.find(p => p.type === name).value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
function availableDate(value) { return validDate(value) && value >= todayKyiv(); }
function initVerification() {
  if (todayKyiv() > "2026-10-31") return;
  if (!CONFIG.turnstileSiteKey) {
    $("submit-status").textContent = "Приглашение ещё настраивается. Попробуй открыть его позже ♡";
    $("submit-status").hidden = false;
    return;
  }
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.onload = () => {
    widgetID = window.turnstile.render($("verification"), {
      sitekey: CONFIG.turnstileSiteKey, theme: "dark", size: "compact", action: "date_response",
      callback: (token) => { verificationToken = token; updateSelection(); },
      "expired-callback": () => { verificationToken = ""; updateSelection(); },
      "error-callback": () => { verificationToken = ""; updateSelection(); }
    });
  };
  script.onerror = () => {
    $("submit-status").textContent = "Не загрузилась проверка безопасности. Обнови страницу ♡";
    $("submit-status").hidden = false;
  };
  document.body.append(script);
}
function resetVerification() {
  verificationToken = "";
  if (widgetID !== undefined && window.turnstile) window.turnstile.reset(widgetID);
}
function requestID() {
  const key = selectedDate + " " + selectedTime;
  if (submissionKey !== key) {
    try {
      const saved = JSON.parse(sessionStorage.getItem("invitation-request") || "null");
      if (saved?.key === key && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(saved.id)) {
        submissionID = saved.id;
        submissionKey = key;
        return submissionID;
      }
    } catch { /* Safari private storage can be unavailable; memory still works. */ }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const h = [...bytes].map(b => b.toString(16).padStart(2,"0")).join("");
    submissionID = h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
    submissionKey = key;
    try { sessionStorage.setItem("invitation-request", JSON.stringify({key,id:submissionID})); } catch {}
  }
  return submissionID;
}
let selectedDate = null;
let selectedTime = null;
const responseData = { accepted: false, date: null, time: null, senderName: CONFIG.senderName };
const shortWeekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const longWeekdays = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const dateButtons = new Map();
const timeButtons = new Map();
const timeOptions = Array.from({ length: 18 }, (_, index) => {
  const minutes = 600 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// Text goes through textContent, including every personal field.
function personalize() {
  const name = CONFIG.senderName.trim() || "Максим";
  $("greeting").textContent = `${CONFIG.girlName.trim() ? CONFIG.girlName.trim() + ", у" : "У"} меня к тебе серьёзный вопрос`;
  $("signature").textContent = `— ${name} ♡`;
  document.title = CONFIG.girlName.trim() ? `Для ${CONFIG.girlName.trim()} ♡` : "Для тебя ♡";
}

function validDate(value) {
  return typeof value === "string" && /^2026-10-(0[5-9]|[12]\d|3[01])$/.test(value);
}

function displayDate(value) {
  if (!validDate(value)) return "";
  const day = Number(value.slice(-2));
  const weekday = new Date(Date.UTC(2026, 9, day)).getUTCDay();
  return `${longWeekdays[weekday]}, ${day} октября`;
}

function createOption(className, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  return button;
}

function buildChoices() {
  const dates = document.createDocumentFragment();
  // October 1, 2026 is Thursday: three empty Monday–Wednesday cells.
  const offset = (new Date(Date.UTC(2026, 9, 1)).getUTCDay() + 6) % 7;
  for (let i = 0; i < offset; i++) {
    const spacer = document.createElement("span");
    spacer.setAttribute("aria-hidden", "true");
    dates.append(spacer);
  }
  for (let day = 1; day <= 31; day++) {
    const value = `2026-10-${String(day).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(2026, 9, day)).getUTCDay();
    const button = createOption("date-option", `${longWeekdays[weekday]}, ${day} октября 2026${day < 5 ? ", недоступно" : ""}`);
    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = String(day);
    const name = document.createElement("span");
    name.className = "day-name";
    name.textContent = shortWeekdays[(weekday + 6) % 7];
    button.append(number, name);
    button.disabled = !availableDate(value);
    button.dataset.date = value;
    button.addEventListener("click", () => selectDate(value));
    dateButtons.set(value, button);
    dates.append(button);
  }
  $("date-grid").append(dates);

  const times = document.createDocumentFragment();
  for (const value of timeOptions) {
    const button = createOption("time-option", `Выбрать время ${value}`);
    button.textContent = value;
    button.dataset.time = value;
    button.addEventListener("click", () => selectTime(value));
    timeButtons.set(value, button);
    times.append(button);
  }
  $("time-grid").append(times);
}

function markSelected(buttons, value) {
  for (const [key, button] of buttons) {
    button.classList.toggle("selected", key === value);
    button.setAttribute("aria-pressed", String(key === value));
  }
}

function updateSelection() {
  const ready = availableDate(selectedDate) && timeOptions.includes(selectedTime);
  $("confirm").disabled = state.busy || !ready || !verificationToken;
  $("selection-summary").textContent = ready
    ? `${displayDate(selectedDate)} · ${selectedTime}`
    : selectedDate ? `${displayDate(selectedDate)} · выбери время` : "Выбери день, а затем время";
}

function selectDate(value) {
  if (state.busy || state.screen !== "schedule" || !availableDate(value)) return;
  const firstChoice = selectedDate === null;
  selectedDate = value;
  markSelected(dateButtons, value);
  $("time-section").hidden = false;
  updateSelection();
  if (firstChoice) {
    // Scroll only the inner selection region, keeping confirmation in view.
    requestAnimationFrame(() => {
      const scroll = $("selection-scroll");
      const top = $("time-section").offsetTop - 12;
      if (typeof scroll.scrollTo === "function") {
        scroll.scrollTo({ top, behavior: motion.matches ? "auto" : "smooth" });
      } else scroll.scrollTop = top;
    });
  }
}

function setSending(sending) {
  $("confirm").disabled = sending;
  $("confirm").textContent = sending ? "Отправляем… ♡" : "Подтвердить ♡";
  $("confirm").setAttribute("aria-busy", String(sending));
  for (const [date, button] of dateButtons) button.disabled = sending || !availableDate(date);
  for (const button of timeButtons.values()) button.disabled = sending;
}

function selectTime(value) {
  if (state.busy || state.screen !== "schedule" || !availableDate(selectedDate) || !timeOptions.includes(value)) return;
  selectedTime = value;
  markSelected(timeButtons, value);
  updateSelection();
}

function decorate() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 22; i++) {
    const el = document.createElement("span");
    el.className = `particle${i % 3 ? " dot" : ""}`;
    el.textContent = i % 3 ? "" : "♡";
    el.style.cssText = `left:${5 + Math.random() * 90}%;top:${4 + Math.random() * 92}%;--duration:${12 + Math.random() * 15}s;--opacity:${.12 + Math.random() * .2};--size:${12 + Math.random() * 17}px;animation-delay:-${Math.random() * 20}s`;
    fragment.append(el);
  }
  $("particles").append(fragment);
}

async function showScreen(next) {
  const current = $(state.screen);
  // Never hide an ancestor of the focused button (avoids aria-hidden warnings).
  if (document.activeElement && current.contains(document.activeElement)) document.activeElement.blur();
  current.classList.add("leaving");
  current.inert = true;
  current.setAttribute("aria-hidden", "true");
  await pause(motion.matches ? 0 : 330);
  current.hidden = true;
  current.classList.remove("active", "leaving");
  const target = $(next);
  target.hidden = false;
  target.inert = false;
  target.removeAttribute("aria-hidden");
  state.screen = next;
  // Two frames allow Safari to paint the entering state before transitioning.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  target.classList.add("active");
  target.querySelector("h1, h2").focus({ preventScroll: true });
}

function heartBurst() {
  if (motion.matches) return;
  for (let i = 0; i < 14; i++) {
    const heart = document.createElement("span");
    heart.className = "burst-heart";
    heart.textContent = "♡";
    const angle = (Math.PI * 2 * i) / 14;
    heart.style.cssText = `--x:${Math.cos(angle) * 105}px;--y:${Math.sin(angle) * 95 - 45}px;--r:${Math.random() * 80 - 40}deg`;
    $("burst").append(heart);
  }
  setTimeout(() => $("burst").replaceChildren(), 1000);
}

// Only the reserved button zone is used: the heading and Yes stay unobstructed.
function placeNo(randomize = false) {
  if (state.screen !== "invitation") return;
  const zone = $("no-zone");
  const button = $("no");
  // Expanded text/long names must not push this button outside its reserved zone.
  zone.style.minHeight = `${button.offsetHeight + 12}px`;
  const maxX = Math.max(0, zone.clientWidth - button.offsetWidth);
  const maxY = Math.max(0, zone.clientHeight - button.offsetHeight);
  if (randomize) state.position = (state.position + 1 + Math.floor(Math.random() * 2)) % 3;
  const slots = [ { x: .5, y: 0 }, { x: 0, y: 1 }, { x: 1, y: .48 } ];
  const slot = slots[state.position];
  button.style.transform = `translate(${Math.round(maxX * slot.x)}px, ${Math.round(maxY * slot.y)}px)`;
}

function dodgeOrDecline(event) {
  if (state.busy || state.screen !== "invitation") return;
  if (state.attempts < 4) {
    if (event) event.preventDefault();
    state.attempts++;
    const labels = ["Точно?", "Может всё-таки да?", `Ну ${CONFIG.senderName.trim() || "Максим"} же старался`, "Последний шанс передумать ♡"];
    $("no").textContent = labels[state.attempts - 1];
    // Preserve a clear accessible label as the playful visible copy changes.
    $("no").setAttribute("aria-label", `${labels[state.attempts - 1]}. Отказаться от приглашения`);
    placeNo(true);
    return;
  }
  state.busy = true;
  showScreen("refusal").then(() => { state.busy = false; });
}

// A pointer attempt is handled once on down; its synthesized click is suppressed.
$("no").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  dodgeOrDecline(event);
});
$("no").addEventListener("click", (event) => {
  if (event.detail === 0 || !("PointerEvent" in window)) dodgeOrDecline(event); // keyboard, AT, old touch browsers
  else event.preventDefault();
});

$("yes").addEventListener("click", async () => {
  if (state.busy || state.screen !== "invitation") return;
  state.busy = true;
  $("yes").disabled = true;
  $("no").disabled = true;
  $("yes").classList.add("accepted");
  $("card").classList.add("celebrate");
  heartBurst();
  await pause(motion.matches ? 0 : 350);
  await showScreen("confirmation");
  $("particles").querySelectorAll(".dot").forEach((el, index) => {
    if (index < 4) { el.classList.remove("dot"); el.textContent = "♡"; }
  });
  $("particles").querySelectorAll(".particle:not(.dot)").forEach((el) => { el.style.setProperty("--opacity", ".48"); });
  await pause(motion.matches ? 450 : 1000);
  await showScreen("schedule");
  state.busy = false;
  initVerification();
});

$("confirm").addEventListener("click", async () => {
  if (state.busy || state.screen !== "schedule" || !availableDate(selectedDate) || !timeOptions.includes(selectedTime) || !verificationToken) return;
  state.busy = true;
  setSending(true);
  $("submit-status").hidden = true;
  // Keep the agreed four fields; backend delivery is separate from acceptance.
  Object.assign(responseData, { accepted: true, date: selectedDate, time: selectedTime, senderName: CONFIG.senderName });
  window.responseData = responseData;
  window.selectedDate = selectedDate;
  window.selectedTime = selectedTime;
  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 25000);
    const result = await fetch("/api/respond", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...responseData, requestId: requestID(), turnstileToken: verificationToken }), signal: controller.signal
    });
    const answer = await result.json();
    if (!result.ok || answer.ok !== true || answer.delivered !== true) {
      const error = new Error("Delivery not confirmed");
      error.status = result.status;
      error.code = answer.error;
      throw error;
    }
    $("date").textContent = displayDate(selectedDate);
    $("time").textContent = selectedTime;
    $("confirm").classList.add("accepted");
    heartBurst();
    await pause(motion.matches ? 0 : 350);
    await showScreen("final");
  } catch (error) {
    $("submit-status").textContent = error.code === "DELIVERY_UNCERTAIN"
      ? "Ответ мог уже дойти. Уточни у отправителя, прежде чем выбирать заново ♡"
      : error.code === "INVITATION_EXPIRED" || error.code === "DATE_PASSED"
      ? "Этот день уже прошёл. Выбери доступную дату или свяжись с отправителем ♡"
      : error.status === 429
      ? "Подожди немного и попробуй ещё раз ♡"
      : "Не удалось подтвердить отправку. Твой выбор сохранён — попробуй ещё раз ♡";
    $("submit-status").hidden = false;
    resetVerification();
  } finally {
    clearTimeout(timeout);
    state.busy = false;
    setSending(false);
    if (state.screen === "schedule") updateSelection();
  }
});

$("back").addEventListener("click", async () => {
  if (state.busy) return;
  state.busy = true;
  // Keep the four attempts exhausted: returning never forces another dodge cycle.
  await showScreen("invitation");
  placeNo();
  state.busy = false;
});

personalize();
buildChoices();
if (todayKyiv() > "2026-10-31") {
  $("submit-status").textContent = "Даты приглашения закончились. Отправителю нужно обновить настройки ♡";
  $("submit-status").hidden = false;
}
updateSelection();
decorate();
placeNo();
window.addEventListener("resize", () => placeNo());
if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => placeNo()).observe($("no-zone"));
