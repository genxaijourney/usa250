/* USA 250 — Trivia game logic (Wave 2).
 * -------------------------------------------------------------
 * Adds patriotic sfx, milestone fireworks (every 10 correct),
 * iOS audio unlock, and a floating sound toggle button.
 * -------------------------------------------------------------
 */

import {
  db, ref, get, set, update, onValue, ensureSignedIn, serverTimestamp
} from "./firebase.js";
import { loadQuestions } from "./questions.js";
import { $, el, clear, shuffle } from "./ui.js";
import * as sfx from "./sfx.js";
import * as fireworks from "./fireworks.js";

const NAME_KEY  = "usa250.playerName";
const DIFF_KEY  = "usa250.difficulty";
const INDEX_KEY = "usa250.playIndex";
const MUTE_KEY  = "usa250.muted";

const CHOICE_LETTERS = ["A", "B", "C", "D"];
const DIFFICULTIES = ["easy", "medium", "hard"];

const state = {
  user: null,
  playerId: null,
  playerName: "",
  difficulty: "medium",
  questions: [],
  index: 0,
  scores: {},
  answered: {},
  currentChoices: []
};

async function boot() {
  // Init fireworks canvas
  const canvasEl = document.getElementById("fireworks-canvas");
  if (canvasEl) fireworks.init(canvasEl);

  // iOS audio unlock on first user gesture
  const unlockAudio = () => {
    sfx.unlock();
    document.removeEventListener("click", unlockAudio);
    document.removeEventListener("touchstart", unlockAudio);
  };
  document.addEventListener("click", unlockAudio, { once: false });
  document.addEventListener("touchstart", unlockAudio, { once: false });

  // Restore saved mute preference
  const savedMuted = localStorage.getItem(MUTE_KEY) === "yes";
  sfx.setEnabled(!savedMuted);
  mountMuteButton();

  state.user = await ensureSignedIn();
  state.playerId = state.user.uid;

  const cfgSnap = await get(ref(db, "config"));
  const cfg = cfgSnap.exists() ? cfgSnap.val() : { live: true };
  if (cfg.live === false) return renderNotLive();

  state.questions = await loadQuestions();
  if (state.questions.length === 0) return renderEmpty();

  const savedName = localStorage.getItem(NAME_KEY);
  const savedDiff = localStorage.getItem(DIFF_KEY);
  if (!savedName || !savedDiff) return renderSetup();
  state.playerName = savedName;
  state.difficulty = savedDiff;

  await ensurePlayerRecord();
  await loadMyScores();
  subscribeLeaderboard();

  const savedIndex = parseInt(localStorage.getItem(INDEX_KEY) || "0", 10);
  state.index = Number.isFinite(savedIndex) ? Math.max(0, Math.min(savedIndex, state.questions.length)) : 0;

  render();
}

/* ---------- Sound toggle button ---------- */

function mountMuteButton() {
  if (document.getElementById("sfx-toggle")) return;
  const btn = document.createElement("button");
  btn.id = "sfx-toggle";
  btn.className = "sfx-toggle";
  btn.type = "button";
  updateMuteButton(btn);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const nowEnabled = sfx.getEnabled();
    sfx.setEnabled(!nowEnabled);
    localStorage.setItem(MUTE_KEY, nowEnabled ? "yes" : "no");
    updateMuteButton(btn);
  });
  document.body.appendChild(btn);
}

function updateMuteButton(btn) {
  const on = sfx.getEnabled();
  btn.setAttribute("aria-label", on ? "Sound ON — tap to mute" : "Sound OFF — tap to unmute");
  btn.classList.toggle("sfx-off", !on);
  btn.innerHTML = on
    ? '<span class="sfx-icon">🔊</span><span class="sfx-label">SOUND ON</span>'
    : '<span class="sfx-icon">🔇</span><span class="sfx-label">SOUND OFF</span>';
}

/* ---------- Screens ---------- */

function renderNotLive() {
  const screen = $("#screen"); clear(screen);
  screen.append(
    el("div", { class: "poster-card center" },
      el("h2", {}, "The trivia isn't open yet."),
      el("p", {}, "Check back soon — Dan will flip the switch when it's showtime.")
    )
  );
  renderLeaderboard();
}

function renderEmpty() {
  const screen = $("#screen"); clear(screen);
  screen.append(
    el("div", { class: "poster-card center" },
      el("h2", {}, "Still loading the questions."),
      el("p", {}, "Dan is prepping the trivia — come back in a bit.")
    )
  );
}

function renderSetup() {
  const screen = $("#screen"); clear(screen);
  const nameInput = el("input", { placeholder: "Your name (e.g. Aunt Pat)", value: state.playerName || "" });
  const diffPicker = el("div", { class: "difficulty-picker" });

  let selectedDiff = state.difficulty || "medium";
  DIFFICULTIES.forEach((d) => {
    const btn = el("button", { class: "difficulty-pick" + (d === selectedDiff ? " selected" : ""), "data-level": d, type: "button" }, d.toUpperCase());
    btn.addEventListener("click", () => {
      selectedDiff = d;
      Array.from(diffPicker.children).forEach(c => c.classList.remove("selected"));
      btn.classList.add("selected");
    });
    diffPicker.append(btn);
  });

  const startBtn = el("button", { class: "btn btn-primary" }, "PLAY BALL!");
  startBtn.addEventListener("click", async () => {
    const name = (nameInput.value || "").trim();
    if (!name) { nameInput.focus(); return; }
    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(DIFF_KEY, selectedDiff);
    state.playerName = name;
    state.difficulty = selectedDiff;
    await ensurePlayerRecord();
    await loadMyScores();
    subscribeLeaderboard();
    state.index = 0;
    persistIndex();
    render();
  });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") startBtn.click(); });

  screen.append(
    el("div", { class: "setup-card" },
      el("h1", {}, "Ready, Patriot?"),
      el("p", {}, "Enter your name and pick your challenge."),
      el("label", { style: { display: "block", fontFamily: "'Alfa Slab One'", fontSize: "14px", letterSpacing: "2px", color: "var(--brown-ink)", marginTop: "10px" }}, "YOUR NAME"),
      nameInput,
      el("label", { style: { display: "block", fontFamily: "'Alfa Slab One'", fontSize: "14px", letterSpacing: "2px", color: "var(--brown-ink)" }}, "DIFFICULTY"),
      diffPicker,
      el("p", { style: { fontSize: "13px", marginTop: "4px" }}, "Easy = obvious distractors · Medium = plausible · Hard = tricky"),
      startBtn
    )
  );
  renderLeaderboard();
}

async function ensurePlayerRecord() {
  const playerRef = ref(db, "players/" + state.playerId);
  const snap = await get(playerRef);
  if (!snap.exists()) {
    await set(playerRef, {
      name:       state.playerName,
      totalScore: 0,
      difficulty: state.difficulty,
      createdAt:  serverTimestamp(),
      lastSeen:   serverTimestamp()
    });
  } else {
    await update(playerRef, {
      name: state.playerName,
      difficulty: state.difficulty,
      lastSeen: serverTimestamp()
    });
  }
}

async function loadMyScores() {
  const snap = await get(ref(db, "scores/" + state.playerId));
  state.answered = snap.exists() ? snap.val() : {};
}

function render() {
  if (state.index >= state.questions.length) return renderComplete();

  const q = state.questions[state.index];
  const already = state.answered[q.id];
  const myScore = Object.values(state.answered).filter(a => a && a.correct).length;

  const screen = $("#screen"); clear(screen);
  const card = el("div", { class: "poster-card" });

  const meta = el("div", { class: "q-meta" },
    el("span", { class: "category-badge" }, q.category),
    el("span", { class: "q-counter" }, `#${state.index + 1} / ${state.questions.length}`)
  );

  const pct = Math.round((state.index / state.questions.length) * 100);
  const progress = el("div", { class: "progress-bar" }, el("div", { style: { width: pct + "%" }}));

  const qText = el("div", { class: "q-text" }, q.text);

  const distractorSet = q.distractors[state.difficulty] || q.distractors["medium"];
  const choicesRaw = shuffle([
    { text: q.correct, isCorrect: true },
    ...distractorSet.map(d => ({ text: d, isCorrect: false }))
  ]);
  state.currentChoices = choicesRaw;

  const choicesGrid = el("div", { class: "choices-grid" });
  choicesRaw.forEach((choice, i) => {
    const btn = el("button", { class: "choice-btn", type: "button", "data-letter": CHOICE_LETTERS[i] }, choice.text);
    btn.addEventListener("click", () => pick(q, i, choice, choicesGrid, card, myScore));
    if (already) {
      btn.disabled = true;
      if (choice.isCorrect) btn.classList.add("correct");
      if (i === already.chosenIndex && !choice.isCorrect) btn.classList.add("wrong");
    }
    choicesGrid.append(btn);
  });

  card.append(meta, progress, qText, choicesGrid);

  if (already) {
    card.append(renderFeedback(already.correct, myScore));
    if (q.learnMore) card.append(renderLearnMoreToggle(q.learnMore));
  }

  const actions = el("div", { class: "actions" });
  actions.append(el("button", { class: "btn btn-ghost", onclick: () => { if (state.index > 0) { state.index--; persistIndex(); render(); } }}, "← BACK"));
  if (already) {
    actions.append(el("button", { class: "btn btn-primary", onclick: () => { state.index++; persistIndex(); render(); }}, "NEXT →"));
  }
  card.append(actions);

  screen.append(card);
  renderLeaderboard();
}

function renderFeedback(correct, score) {
  if (correct) {
    // Milestone indicator on multiples of 10
    if (score > 0 && score % 10 === 0) {
      return el("div", { class: "feedback-badge feedback-correct feedback-milestone" },
        `🎇 MILESTONE ${score}! 🎇`,
        el("span", { style: { display: "block", fontSize: "14px", marginTop: "4px", letterSpacing: "2px" }}, `Firework #${score / 10} of 20`)
      );
    }
    return el("div", { class: "feedback-badge feedback-correct" },
      "✨ Correct!",
      el("span", { style: { display: "block", fontSize: "14px", marginTop: "4px", letterSpacing: "2px" }}, `Fireworks at ${Math.floor(score / 10) * 10 + 10}`)
    );
  }
  return el("div", { class: "feedback-badge feedback-wrong" }, "So close! The correct answer is highlighted.");
}

function renderLearnMoreToggle(text) {
  const wrap = el("div", { style: { textAlign: "center" } });
  const btn = el("button", { class: "learn-more-toggle" }, "📖 Learn More");
  const body = el("div", { class: "learn-more-body" }, text);
  body.style.display = "none";
  btn.addEventListener("click", () => {
    const show = body.style.display === "none";
    body.style.display = show ? "block" : "none";
    btn.textContent = show ? "📖 Hide" : "📖 Learn More";
  });
  wrap.append(btn, body);
  return wrap;
}

async function pick(q, chosenIndex, choice, choicesGrid, card, prevScore) {
  const btns = choicesGrid.querySelectorAll(".choice-btn");
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (state.currentChoices[i].isCorrect) btn.classList.add("correct");
    if (i === chosenIndex && !choice.isCorrect) btn.classList.add("wrong");
  });

  await set(ref(db, `scores/${state.playerId}/${q.id}`), {
    chosenIndex,
    correct: !!choice.isCorrect,
    difficulty: state.difficulty,
    answeredAt: serverTimestamp()
  });
  state.answered[q.id] = { chosenIndex, correct: !!choice.isCorrect };

  const newScore = Object.values(state.answered).filter(a => a && a.correct).length;
  await update(ref(db, "players/" + state.playerId), {
    totalScore: newScore, lastSeen: serverTimestamp()
  });

  // Sound + fireworks
  if (choice.isCorrect) {
    sfx.playCorrect();
    if (newScore > 0 && newScore % 10 === 0) {
      fireworks.celebrateMilestone(newScore / 10);
    }
  } else {
    sfx.playWrong();
  }

  const existingActions = card.querySelector(".actions");
  const feedback = renderFeedback(!!choice.isCorrect, newScore);
  card.insertBefore(feedback, existingActions);
  if (q.learnMore) card.insertBefore(renderLearnMoreToggle(q.learnMore), existingActions);

  if (!existingActions.querySelector(".btn-primary")) {
    existingActions.append(el("button", { class: "btn btn-primary", onclick: () => { state.index++; persistIndex(); render(); }}, "NEXT →"));
  }
}

function persistIndex() { localStorage.setItem(INDEX_KEY, String(state.index)); }

function renderComplete() {
  const totalCorrect = Object.values(state.answered).filter(a => a && a.correct).length;
  const screen = $("#screen"); clear(screen);
  // Grand finale firework
  setTimeout(() => fireworks.celebrate(Math.max(200, totalCorrect * 2)), 400);
  screen.append(
    el("div", { class: "poster-card center" },
      el("h1", { style: { fontFamily: "'Ultra','Alfa Slab One'", fontSize: "36px", color: "var(--old-glory-blue)", textShadow: "2px 2px 0 var(--mustard)" }}, "🎇 You Did It, Patriot!"),
      el("p", { style: { fontFamily: "'Alfa Slab One'", fontSize: "22px", color: "var(--old-glory-red)", letterSpacing: "2px" }}, `${totalCorrect} correct out of ${state.questions.length}`),
      el("p", {}, "Happy 250th, America 🇺🇸"),
      el("div", { class: "actions", style: { marginTop: "24px" }},
        el("button", { class: "btn btn-secondary", onclick: () => { state.index = 0; persistIndex(); render(); }}, "PLAY AGAIN"),
        el("button", { class: "btn btn-ghost", onclick: () => { localStorage.removeItem(DIFF_KEY); renderSetup(); }}, "CHANGE DIFFICULTY")
      )
    )
  );
  renderLeaderboard();
}

function subscribeLeaderboard() {
  onValue(ref(db, "players"), (snap) => {
    state.scores = snap.exists() ? snap.val() : {};
    renderLeaderboard();
  });
}

function renderLeaderboard() {
  const wrap = $("#leaderboard");
  if (!wrap) return;
  clear(wrap);
  const players = Object.entries(state.scores)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .slice(0, 30);
  if (players.length === 0) {
    wrap.append(el("div", { class: "lb-empty" }, "No scores yet.", el("br"), "Be the first!"));
    return;
  }
  players.forEach((p, idx) => {
    const rank = idx + 1;
    const isYou = p.id === state.playerId;
    wrap.append(el("div", { class: "lb-row" + (isYou ? " you" : "") },
      el("span", { class: "lb-rank" + (rank <= 3 ? " lb-rank-" + rank : "") }, rank + "."),
      el("span", { class: "lb-name" }, (p.name || "Anonymous") + (isYou ? " (you)" : "")),
      el("span", { class: "lb-score" }, String(p.totalScore || 0))
    ));
  });
}

boot().catch((e) => {
  console.error(e);
  const screen = $("#screen");
  if (screen) screen.innerHTML = "<div class='poster-card center'><h2>Something went sideways.</h2><p>Try refreshing this page.</p></div>";
});
