# Reddit "Games with a Hook" — Hackathon Project

Building a **Reddit game on Devvit Web** for Reddit's *Games with a Hook* hackathon
(submissions due **July 15, 2026 @ 6pm PDT**, $40k prize pool).

**Status:** ✅ Concept chosen (2026-07-03): **"The Township"** — a persistent living town
of Snoovatar citizens that simulates 24/7 and posts a daily generated newspaper.
See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for design + 12-day scope plan.

## Docs

| Doc | What's in it |
|---|---|
| [docs/HACKATHON.md](docs/HACKATHON.md) | Official rules, dates, prize breakdown, judging criteria, do's & don'ts, reference games. |
| [docs/DEVVIT_PLATFORM.md](docs/DEVVIT_PLATFORM.md) | Devvit Web architecture, `devvit.json` schema, server/client APIs, CLI, and the build checklist. |
| [docs/GROUND_RULES.md](docs/GROUND_RULES.md) | Design pillars + engineering conventions every decision is measured against. |
| [docs/GAME_IDEAS.md](docs/GAME_IDEAS.md) | Brainstorm log: candidate concepts, scoring rubric, decision status. |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | **The chosen game**: The Township — full design, systems, data model, day-by-day scope plan. |

## The one-paragraph strategy

The main prize ($15k) is **retention**. The differentiators vs. the field are **UGC** ($3k)
and **Phaser** ($5k). Reddit's winning pattern is *one shared **daily** challenge → a
satisfying reveal → comments become the social layer → streaks bring you back → **users
generate the content** so it never runs dry.* We aim for retention + UGC as the core, with
Phaser polish layered on. Everything must be **self-explanatory** (judged via the demo post)
and **mobile-first**.

## Next steps

1. Brainstorm + score concepts → **pick one** (see [GAME_IDEAS.md](docs/GAME_IDEAS.md)).
2. `npm create devvit@latest --template=phaser`, `devvit login`, verify `npm run dev`.
3. Build the core loop → daily scheduler → UGC flow → polish → publish → demo post.
