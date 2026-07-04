/* USA 250 — Admin (Dan-only). Password-gated, seed + toggle live. */

import { db, ref, get, set, update, remove, ensureSignedIn } from "./firebase.js";
import { seedQuestions } from "./questions.js";
import { $, el, clear } from "./ui.js";

// sha256("123456") — fallback for quick access. Change before mass sharing.
const FALLBACK_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const SESSION_KEY = "usa250.adminOk";

async function boot() {
  await ensureSignedIn();
  if (sessionStorage.getItem(SESSION_KEY) === "yes") return renderApp();
  renderGate();
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, "0")).join("");
}

function renderGate() {
  const screen = $("#screen"); clear(screen);
  const input = el("input", { type: "password", placeholder: "Admin password" });
  const btn = el("button", { class: "btn btn-primary" }, "UNLOCK");
  const msg = el("p", {}, "");
  btn.addEventListener("click", async () => {
    const h = await sha256(input.value || "");
    if (h === FALLBACK_HASH) {
      sessionStorage.setItem(SESSION_KEY, "yes");
      renderApp();
    } else msg.textContent = "Nope — try again.";
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });
  screen.append(
    el("div", { class: "setup-card" },
      el("h1", {}, "🔐 Admin"),
      el("p", {}, "Password protected."),
      input,
      btn,
      msg
    )
  );
}

async function renderApp() {
  const screen = $("#screen"); clear(screen);

  const cfgSnap = await get(ref(db, "config"));
  const live = cfgSnap.exists() ? !!cfgSnap.val().live : false;

  const seedMsg = el("p", { id: "seed-msg" }, "");
  const liveBtn = el("button", { class: "btn " + (live ? "btn-primary" : "btn-secondary") }, live ? "✅ TRIVIA IS LIVE — Click to hide" : "🚫 TRIVIA IS HIDDEN — Click to open");
  liveBtn.addEventListener("click", async () => {
    const cur = await get(ref(db, "config"));
    const now = cur.exists() ? !!cur.val().live : false;
    await update(ref(db, "config"), { live: !now });
    renderApp();
  });

  const seedBtn = el("button", { class: "btn btn-primary" }, "SEED QUESTIONS");
  seedBtn.addEventListener("click", async () => {
    seedMsg.textContent = "Seeding…";
    try {
      const res = await seedQuestions();
      seedMsg.textContent = res.skipped ? `Already seeded (${res.count} questions).` : `Seeded ${res.count} questions.`;
    } catch (e) {
      seedMsg.textContent = "Error: " + e.message;
    }
  });

  const forceSeedBtn = el("button", { class: "btn btn-ghost" }, "FORCE RE-SEED");
  forceSeedBtn.addEventListener("click", async () => {
    if (!confirm("Overwrite all questions with the current seed file?")) return;
    seedMsg.textContent = "Re-seeding…";
    try {
      const res = await seedQuestions({ overwrite: true });
      seedMsg.textContent = `Re-seeded ${res.count} questions.`;
    } catch (e) {
      seedMsg.textContent = "Error: " + e.message;
    }
  });

  const resetBtn = el("button", { class: "btn", style: { background: "var(--red-deep)", color: "var(--cream)", borderColor: "var(--brown-ink)" }}, "🧹 RESET PLAYER DATA");
  resetBtn.addEventListener("click", async () => {
    if (!confirm("Wipe ALL leaderboard players and their scores?\n\nThis clears /players/ and /scores/ so everyone starts fresh at zero.\n\nQuestions, difficulty picks, and the LIVE toggle are NOT touched.\n\nContinue?")) return;
    seedMsg.textContent = "Wiping player data…";
    try {
      const mod = await import("./firebase.js");
      await mod.remove(mod.ref(mod.db, "players"));
      await mod.remove(mod.ref(mod.db, "scores"));
      seedMsg.textContent = "✅ Player data cleared. Leaderboard is empty. Family can play fresh.";
    } catch (e) {
      seedMsg.textContent = "Error wiping: " + e.message;
    }
  });

  const logoutBtn = el("button", { class: "btn btn-ghost" }, "LOCK");
  logoutBtn.addEventListener("click", () => { sessionStorage.removeItem(SESSION_KEY); renderGate(); });

  screen.append(
    el("div", { class: "poster-card" },
      el("h2", { style: { fontFamily: "'Alfa Slab One'", color: "var(--old-glory-blue)" }}, "Admin Dashboard"),
      el("div", { class: "actions" }, seedBtn, forceSeedBtn, liveBtn, resetBtn, logoutBtn),
      seedMsg
    )
  );
}

boot().catch((e) => {
  console.error(e);
  const screen = $("#screen");
  if (screen) screen.innerHTML = "<div class='poster-card center'><h2>Error loading admin.</h2></div>";
});
