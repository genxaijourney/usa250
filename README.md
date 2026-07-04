# USA 250 — Trivia Game

**A family trivia game celebrating America's 250th birthday (Semiquincentennial, July 4, 2026).**

## Stack (locked, matches the mom80th playbook)

| Layer | Tool |
|---|---|
| Source | GitHub — genxaijourney/usa250 |
| Hosting | Vercel — auto-deploys main |
| Realtime DB | Firebase Realtime Database (usa250) |
| Auth | Firebase Anonymous Auth |
| Framework | Vanilla HTML + CSS + JS (no build step) |

## What it is

A multiple-choice trivia game about the founding, growth, moments, and characters that shaped the United States over 250 years. Players open one URL on their phone, enter a name, and play at their own pace. Global live leaderboard.

## Routes (planned)

- `/` — landing with a big red-white-and-blue "Play" button
- `/play` — the trivia game (multiple choice, live leaderboard, escalating fireworks on milestone scores)
- `/admin` — Dan-only (password-gated)

## Status

Scaffold only. Repo + Vercel + Firebase created 2026-07-03. Trivia questions, distractors, and photos to be written.

## Owner

Dan Herlehy · genxaijourney@gmail.com
