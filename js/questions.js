/* USA 250 — one-time seed of trivia questions into Firebase RTDB. */

import { db, ref, get, set } from "./firebase.js";

export async function seedQuestions({ overwrite = false } = {}) {
  const questionsRef = ref(db, "questions");
  const snapshot = await get(questionsRef);

  if (snapshot.exists() && !overwrite) {
    return { skipped: true, count: Object.keys(snapshot.val() || {}).length };
  }

  const res = await fetch("./seed-questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not fetch seed-questions.json (" + res.status + ")");
  const questions = await res.json();

  const map = {};
  for (const q of questions) {
    if (!q.id || !q.order || !q.category || !q.text || !q.correct || !q.distractors) {
      throw new Error("Bad question in seed: " + JSON.stringify(q).substring(0, 200));
    }
    map[q.id] = {
      order:       q.order,
      category:    q.category,
      text:        q.text,
      correct:     q.correct,
      distractors: q.distractors,
      learnMore:   q.learnMore || null
    };
  }

  await set(questionsRef, map);

  // Also seed /config if missing
  const configSnap = await get(ref(db, "config"));
  if (!configSnap.exists()) {
    await set(ref(db, "config"), {
      live: false,
      totalQuestions: questions.length
    });
  }

  return { skipped: false, count: questions.length };
}

export async function loadQuestions() {
  const snapshot = await get(ref(db, "questions"));
  if (!snapshot.exists()) return [];
  const raw = snapshot.val();
  return Object.entries(raw)
    .map(([id, q]) => ({ id, ...q }))
    .sort((a, b) => a.order - b.order);
}
