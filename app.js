import { firebaseConfig, groupName } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";
const ME_KEY = "nutjer.me";
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DOW_LONG = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"];

const app = document.getElementById("app");

// ---------------------------------------------------------------- helpers
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } }

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------------------------------------------------------------- stores
// Both stores expose: subscribe(cb), update(pathMap), addMember(name) -> id
// pathMap is like { "avail/<memberId>/2026-12-05": true | null }

function applyPaths(data, paths) {
  for (const [path, val] of Object.entries(paths)) {
    const parts = path.split("/");
    let node = data;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ??= {};
      node = node[parts[i]];
    }
    if (val === null) delete node[parts.at(-1)];
    else node[parts.at(-1)] = val;
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function localStore() {
  const KEY = "nutjer.demo";
  let data;
  try { data = JSON.parse(lsGet(KEY)) || {}; } catch { data = {}; }
  let listener = () => {};
  return {
    demo: true,
    subscribe(cb) { listener = cb; cb(structuredClone(data)); },
    async update(paths) {
      applyPaths(data, paths);
      lsSet(KEY, JSON.stringify(data));
      listener(structuredClone(data));
    },
    async addMember(name) {
      const id = newId();
      await this.update({ [`members/${id}`]: { name, at: Date.now() } });
      return id;
    },
  };
}

async function firebaseStore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const { getDatabase, ref, onValue, update } = await import(`${base}/firebase-database.js`);
  const db = getDatabase(initializeApp(firebaseConfig));
  return {
    demo: false,
    subscribe(cb) {
      onValue(ref(db), (snap) => cb(snap.val() || {}), (err) => {
        console.error(err);
        app.innerHTML = `<div class="card"><h2>เชื่อมต่อฐานข้อมูลไม่ได้ 😢</h2>
          <p class="sub">${esc(err.message)}</p>
          <p class="sub">เช็ค Rules ของ Realtime Database ใน Firebase Console (ดู README)</p></div>`;
      });
    },
    update(paths) { return update(ref(db), paths); },
    async addMember(name) {
      const id = newId();
      await update(ref(db), { [`members/${id}`]: { name, at: Date.now() } });
      return id;
    },
  };
}

// ---------------------------------------------------------------- state
const now = new Date();
const state = {
  data: null,
  me: lsGet(ME_KEY),
  year: now.getFullYear(),
  month: now.getMonth(),
  sel: null,
  draftName: "",
};
let store;

const members = () => {
  const m = state.data?.members || {};
  return Object.entries(m)
    .map(([id, v]) => ({ id, name: v.name, at: v.at || 0 }))
    .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, "th"));
};
const availOf = (id) => state.data?.avail?.[id] || {};
const freeOn = (key) => members().filter((m) => availOf(m.id)[key]);

async function save(paths) {
  try { await store.update(paths); }
  catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ ลองใหม่อีกที"); }
}

// ---------------------------------------------------------------- render
function render() {
  if (!state.data) return;
  const list = members();
  if (!state.me || !list.some((m) => m.id === state.me)) renderPick(list);
  else renderMain(list);
}

function demoBanner() {
  return store.demo
    ? `<div class="demo-banner">⚠️ โหมดทดลอง: ข้อมูลอยู่แค่ในเครื่องนี้ ใส่ค่า Firebase ใน <code>firebase-config.js</code> เพื่อให้เพื่อนเห็นด้วย</div>`
    : "";
}

function renderPick(list) {
  const focused = document.activeElement?.id === "newName";
  app.innerHTML = `
    ${demoBanner()}
    <h1>📅 ${esc(groupName)} ว่างวันไหน?</h1>
    <p class="sub">${list.length ? "แตะชื่อตัวเองเลย (ครั้งเดียวพอ เว็บจำให้)" : "ยังไม่มีใครเลย ใส่ชื่อตัวเองเป็นคนแรก"}</p>
    ${list.length ? `<div class="names">${list.map((m) =>
      `<button class="name-btn" data-act="pick" data-id="${m.id}">${esc(m.name)}</button>`).join("")}</div>` : ""}
    <div class="card">
      <h2>${list.length ? "ไม่มีชื่อตัวเอง?" : "ชื่อเล่นของคุณ"}</h2>
      <form class="add-row" data-act="add">
        <input id="newName" maxlength="30" placeholder="พิมพ์ชื่อเล่น" autocomplete="off" value="${esc(state.draftName)}">
        <button class="btn primary" type="submit">เพิ่ม</button>
      </form>
    </div>`;
  if (focused) {
    const input = document.getElementById("newName");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function heatClass(count, total) {
  if (!count || !total) return "";
  if (count === total) return "h4";
  const r = count / total;
  return r >= 0.7 ? "h3" : r >= 0.4 ? "h2" : "h1";
}

function renderCalendar(list) {
  const { year, month } = state;
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const tKey = todayKey();
  const mine = availOf(state.me);
  const total = list.length;
  const isFirstMonth = year === now.getFullYear() && month === now.getMonth();
  const maxMonth = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  const isLastMonth = first >= maxMonth;

  let cells = DOW.map((d, i) => `<div class="dow ${i === 0 || i === 6 ? "we" : ""}">${d}</div>`).join("");
  for (let i = 0; i < first.getDay(); i++) cells += `<div class="blank"></div>`;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const k = keyOf(date);
    const past = k < tKey;
    const count = freeOn(k).length;
    const cls = [
      "day",
      heatClass(count, total),
      count === total && total > 1 ? "all" : "",
      mine[k] ? "mine" : "",
      past ? "past" : "",
      k === tKey ? "today" : "",
      k === state.sel ? "sel" : "",
      date.getDay() === 0 || date.getDay() === 6 ? "we" : "",
    ].filter(Boolean).join(" ");
    const label = `${d} ${MONTHS[month]}${mine[k] ? " (คุณว่าง)" : ""}, ว่าง ${count} จาก ${total} คน`;
    cells += `<button class="${cls}" data-act="day" data-k="${k}" ${past ? "disabled" : ""} aria-label="${label}" aria-pressed="${!!mine[k]}">
      <span class="n">${d}</span><span class="c">${count ? (count === total && total > 1 ? "🎉" : `${count}/${total}`) : ""}</span>
    </button>`;
  }

  return `
    <div class="card">
      <div class="cal-head">
        <button class="nav" data-act="prev" ${isFirstMonth ? "disabled" : ""} aria-label="เดือนก่อน">‹</button>
        <span class="month">${MONTHS[month]} ${year + 543}</span>
        <button class="nav" data-act="next" ${isLastMonth ? "disabled" : ""} aria-label="เดือนถัดไป">›</button>
      </div>
      <div class="grid">${cells}</div>
      <div class="legend">
        <span><i style="border:2px solid var(--accent)"></i>วันที่คุณว่าง</span>
        <span><i style="background:var(--heat-3)"></i>เขียวเข้ม = ว่างเยอะ</span>
        <span>🎉 = ว่างครบทุกคน</span>
      </div>
      <div class="quick">
        <button class="btn small" data-act="weekends">✅ ว่างทุก ส.-อา. เดือนนี้</button>
        <button class="btn small" data-act="clear">ล้างของฉันเดือนนี้</button>
      </div>
      ${state.sel ? renderDetail(state.sel, list) : ""}
    </div>`;
}

function fmtDate(k, long = true) {
  const d = parseKey(k);
  return long
    ? `วัน${DOW_LONG[d.getDay()]}ที่ ${d.getDate()} ${MONTHS[d.getMonth()]}`
    : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function renderDetail(k, list) {
  const free = freeOn(k);
  const notFree = list.filter((m) => !free.some((f) => f.id === m.id));
  return `<div class="detail">
    <b>${fmtDate(k)}</b>
    ${free.length ? `<div class="chips">${free.map((m) => `<span class="chip">✅ ${esc(m.name)}</span>`).join("")}</div>` : `<p class="empty">ยังไม่มีใครว่าง</p>`}
    ${notFree.length && free.length ? `<p class="miss">ยังไม่ว่าง/ยังไม่กรอก: ${notFree.map((m) => esc(m.name)).join(", ")}</p>` : ""}
  </div>`;
}

function renderBest(list) {
  const tKey = todayKey();
  const counts = {};
  for (const m of list) {
    for (const k of Object.keys(availOf(m.id))) if (k >= tKey) counts[k] = (counts[k] || 0) + 1;
  }
  const minCount = list.length > 1 ? 2 : 1;
  const best = Object.entries(counts)
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);

  const items = best.map(([k, c]) => {
    const d = parseKey(k);
    const free = freeOn(k);
    const miss = list.filter((m) => !free.some((f) => f.id === m.id));
    return `<li>
      <div class="date"><span class="m">${DOW_LONG[d.getDay()]}</span><span class="d">${d.getDate()}</span><span class="m">${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}</span></div>
      <div class="who">
        <div class="cnt">${c === list.length ? "🎉 ว่างครบทุกคน!" : `ว่าง ${c} จาก ${list.length} คน`}</div>
        <div>${free.map((m) => esc(m.name)).join(", ")}</div>
        ${miss.length ? `<div class="miss">ขาด: ${miss.map((m) => esc(m.name)).join(", ")}</div>` : ""}
      </div>
    </li>`;
  }).join("");

  return `<div class="card">
    <h2>🏆 วันที่ว่างตรงกันเยอะสุด</h2>
    ${items ? `<ul class="best">${items}</ul>` : `<p class="empty">ยังไม่มีวันที่ว่างตรงกัน รอเพื่อนกรอกก่อนนะ</p>`}
  </div>`;
}

function renderPending(list) {
  const tKey = todayKey();
  const pending = list.filter((m) => !Object.keys(availOf(m.id)).some((k) => k >= tKey));
  return `<div class="card">
    <h2>📣 ชวนเพื่อนมากรอก</h2>
    ${pending.length
      ? `<p class="sub" style="margin-bottom:8px">ยังไม่กรอกเลย:</p><div class="chips" style="margin-bottom:12px">${pending.map((m) => `<span class="chip">😴 ${esc(m.name)}</span>`).join("")}</div>`
      : `<p class="sub">ทุกคนกรอกแล้ว 👍</p>`}
    <div class="share">
      <button class="btn line" data-act="line">ส่งลิงก์ใน LINE</button>
      <button class="btn" data-act="copy">คัดลอกลิงก์</button>
    </div>
  </div>`;
}

function renderMain(list) {
  const me = list.find((m) => m.id === state.me);
  app.innerHTML = `
    ${demoBanner()}
    <div class="top">
      <div>
        <h1>สวัสดี ${esc(me.name)} 👋</h1>
      </div>
      <button class="link" data-act="logout">ไม่ใช่ ${esc(me.name)}?</button>
    </div>
    <div class="hint">👆 แตะวันที่คุณว่าง แค่นั้นเลย (แตะอีกทีเพื่อยกเลิก) บันทึกอัตโนมัติ</div>
    ${renderCalendar(list)}
    ${renderBest(list)}
    ${renderPending(list)}
  `;
}

// ---------------------------------------------------------------- actions
function shareText() {
  const url = location.href.split("#")[0];
  return `มากรอกวันว่างกันหน่อย แค่แตะวันที่ว่าง ไม่ถึงนาที 🙏\n${url}`;
}

app.addEventListener("input", (e) => {
  if (e.target.id === "newName") state.draftName = e.target.value;
});

app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = state.draftName.trim();
  if (!name) return toast("พิมพ์ชื่อก่อนนะ");
  const exists = members().find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    state.me = exists.id;
  } else {
    try { state.me = await store.addMember(name); }
    catch (err) { console.error(err); return toast("เพิ่มชื่อไม่สำเร็จ ลองใหม่อีกที"); }
  }
  lsSet(ME_KEY, state.me);
  state.draftName = "";
  render();
});

app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "FORM") return;
  const act = el.dataset.act;

  if (act === "pick") {
    state.me = el.dataset.id;
    lsSet(ME_KEY, state.me);
    render();
    window.scrollTo(0, 0);
  } else if (act === "logout") {
    state.me = null;
    lsSet(ME_KEY, null);
    render();
  } else if (act === "day") {
    const k = el.dataset.k;
    const on = !availOf(state.me)[k];
    state.sel = k;
    if (navigator.vibrate) navigator.vibrate(10);
    await save({ [`avail/${state.me}/${k}`]: on ? true : null });
  } else if (act === "prev" || act === "next") {
    const d = new Date(state.year, state.month + (act === "next" ? 1 : -1), 1);
    state.year = d.getFullYear();
    state.month = d.getMonth();
    state.sel = null;
    render();
  } else if (act === "weekends" || act === "clear") {
    const tKey = todayKey();
    const days = new Date(state.year, state.month + 1, 0).getDate();
    const paths = {};
    for (let d = 1; d <= days; d++) {
      const date = new Date(state.year, state.month, d);
      const k = keyOf(date);
      if (k < tKey) continue;
      if (act === "weekends" && (date.getDay() === 0 || date.getDay() === 6)) paths[`avail/${state.me}/${k}`] = true;
      if (act === "clear" && availOf(state.me)[k]) paths[`avail/${state.me}/${k}`] = null;
    }
    if (!Object.keys(paths).length) return toast(act === "clear" ? "เดือนนี้ยังไม่ได้เลือกวันไหน" : "ไม่มีเสาร์-อาทิตย์เหลือในเดือนนี้แล้ว");
    if (act === "clear" && !confirm("ล้างวันว่างของคุณทั้งเดือนนี้?")) return;
    await save(paths);
    toast(act === "weekends" ? "เลือกเสาร์-อาทิตย์ให้แล้ว ✅" : "ล้างแล้ว");
  } else if (act === "line") {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareText())}`, "_blank");
  } else if (act === "copy") {
    try {
      await navigator.clipboard.writeText(shareText());
      toast("คัดลอกแล้ว ไปวางในแชทได้เลย");
    } catch {
      prompt("คัดลอกข้อความนี้:", shareText());
    }
  }
});

// ---------------------------------------------------------------- boot
(async () => {
  const configured = firebaseConfig.databaseURL && firebaseConfig.apiKey;
  try {
    store = configured ? await firebaseStore() : localStore();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h2>โหลดไม่สำเร็จ 😢</h2><p class="sub">เช็คอินเทอร์เน็ตแล้วลองรีเฟรชอีกที</p></div>`;
    return;
  }
  store.subscribe((data) => {
    state.data = data;
    render();
  });
})();
