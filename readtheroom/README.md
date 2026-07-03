# Read the Room

*The Daily Consensus.* A daily crowd-guessing game for Reddit, built on
[Devvit Web](https://developers.reddit.com/).

Every day there is one question with a 0–100 spectrum between two labeled
poles (e.g. **"Pineapple on pizza"** — *a crime against Italy ↔ a tropical
masterpiece*). The skill is not having an opinion — it's predicting where the
**Reddit crowd average** will land.

## The loop

1. Open the post → the inline splash teases today's question.
2. Tap **"Can you read the room?"** → expanded game view.
3. Drag the slider to where you think the community average will end up and
   **lock in** (one guess per day, per player).
4. The signature reveal: a 20-bin histogram of everyone's guesses grows in
   with a staggered spring, the crowd-mean marker drops in, your score counts
   up (`score = 100 − |your guess − crowd mean|`).
5. Post-reveal you get your **streak**, personal stats (games played, average
   accuracy), the **daily top-10 leaderboard**, a **"submit a prompt"** form,
   and a countdown to the next room (00:00 UTC).

Anonymous users can see the question; guessing triggers Reddit's login prompt
(`showLoginPrompt()`).

## Prompt pipeline (UGC)

- Players submit prompts in-app (question + two pole labels) → stored in a
  Redis **pending queue**.
- Mods review via the subreddit menu item **"Read the Room: review prompt
  queue"** — a form lists pending prompts and approves/rejects each.
- Approved prompts form a FIFO queue. The daily cron pops the next approved
  prompt; if the queue is empty it falls back to **30 bundled hand-written
  prompts** (`src/server/core/prompts.ts`), looping with a persistent cursor.

## Architecture

Devvit Web app: React client (two entrypoints) ↔ Hono server over
`fetch('/api/*')` JSON, types shared via `src/shared/api.ts`.

```
src/
  client/            React UI (mobile-first, editorial broadsheet aesthetic)
    splash.tsx/html  Inline in-feed teaser entrypoint ("default", inline)
    game.tsx/html    Expanded game entrypoint ("game")
    components/      Masthead, GuessPanel, RevealPanel, ScoreBoard,
                     SubmitPrompt, Countdown
    hooks/           useGame (state machine), useCountUp (score counter)
  server/
    core/game.ts     All Redis game logic (prompts, guesses, scores, queues)
    core/keys.ts     Every Redis key in one place
    core/prompts.ts  The 30 bundled prompts
    core/post.ts     Game post creation
    routes/          api, menu, forms, scheduler, triggers
  shared/api.ts      Request/response types shared client <-> server
```

### Endpoints (all registered in `devvit.json`)

| Endpoint | Kind | Purpose |
| --- | --- | --- |
| `GET /api/init` | client fetch | Prompt + player state + reveal (if guessed) + stats + leaderboard |
| `GET /api/splash` | client fetch | Lightweight teaser for the inline splash |
| `POST /api/guess` | client fetch | Lock in today's guess (401 for logged-out) |
| `POST /api/submit-prompt` | client fetch | Queue a community prompt for mod review |
| `POST /internal/menu/post-create` | mod menu | Create a new game post |
| `POST /internal/menu/review-queue` | mod menu | Show the review form for pending prompts |
| `POST /internal/form/review-prompt` | form handler | Apply the mod's approve/reject decision |
| `POST /internal/scheduler/daily-prompt` | cron `0 0 * * *` | Assign the day's prompt + create the daily post |
| `POST /internal/triggers/on-app-install` | trigger | Initialize day 1's prompt + first game post |

### Redis data model (hashes, zsets, counters — no scans, no lists/sets)

| Key | Type | Contents |
| --- | --- | --- |
| `rtr:prompt:<date>` | hash | `{ id, question, left, right, author, day }` |
| `rtr:guesses:<date>` | hash | userId → guess (0–100) |
| `rtr:sum:<date>` / `rtr:count:<date>` | counters | running sum/count for the crowd mean |
| `rtr:bins:<date>` | hash | bin index (0–19) → count (reveal histogram) |
| `rtr:lb:<date>` | zset | userId → locked-in score (daily top-10) |
| `rtr:unames` | hash | userId → username |
| `rtr:player:<userId>` | hash | `{ streak, best, played, scoreSum, lastDate }` |
| `rtr:pending` (+ counter) | hash | community submissions awaiting review |
| `rtr:approved` (+ head/tail counters) | hash | approved FIFO prompt queue |
| `rtr:bundled:cursor`, `rtr:day:counter` | counters | bundled rotation + issue number |

## Commands

```bash
npm install        # install dependencies
npm run type-check # tsc --build (clean)
npm run lint       # eslint (clean)
npm run build      # vite build -> dist/client + dist/server
npm run dev        # devvit playtest (requires devvit login)
npm run deploy     # type-check + lint + devvit upload
```

## Design

Editorial-broadsheet-meets-game-show: warm cream paper (`#f7efdf`), warm ink
(`#3e3428`), one hot terracotta accent (`#cd6f47`), Georgia serif headlines,
chunky 3px borders with offset block shadows, spring-eased CSS animations.
No external fonts, images, or network requests from the client.
