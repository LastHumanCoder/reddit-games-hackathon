# Will It Hold?

One sketchy bridge a day. A truck is about to cross it. You have one call to make: **HOLD** or **COLLAPSE**. Then real physics decides who was right.

Built on [Devvit Web](https://developers.reddit.com/) with [Phaser 3](https://phaser.io/) and Matter physics. Everything on screen is drawn in code; every verdict comes from a live rigid-body simulation, not a canned animation.

## How to play

1. Open the daily post. You see today's bridge: a procedurally generated wooden truss of questionable structural integrity, with a truck waiting at the edge.
2. Study it. Count the supports. Eye the joints. Somewhere around 40% of these bridges are secretly doomed.
3. Tap **HOLD** (it will survive) or **COLLAPSE** (it will not). One call per player per day.
4. The simulation runs. The truck drives. Four seconds later you are either smugly correct or watching the deck fold into the ravine.
5. The verdict card shows whether you called it, the community split (what percentage of players agreed with you), your streak, and a roast from the announcer.
6. Come back tomorrow. New bridge, same question.

Already made your call? Reopening the post replays today's simulation and shows the verdict. After your daily call you can keep playing **practice bridges**: endless random structures that sharpen your eye without touching your streak.

## Why it is interesting

- **Same bridge for everyone.** The daily structure is generated from a shared seed, so the whole subreddit argues about one bridge, like a crossword with load-bearing consequences.
- **The crowd is part of the score.** Beating the bridge is fun. Being in the correct 36% while 64% of Reddit got it wrong is delicious.
- **Real simulation.** Deck planks are physics bodies joined by constraints with seeded stiffness. Weak joints, missing struts, and heavy trucks interact honestly. The generator aims for ambiguity: the best bridges split the crowd near 50/50.

## Architecture

Devvit Web app: Phaser client, Hono server, Redis state, types shared via `src/shared/api.ts`.

```
src/
  client/
    splash.html/.ts    In-feed teaser (sunset, bridge, one button)
    game.html/.ts      Expanded game entrypoint
    scenes/            BridgeScene: generation, simulation, UI
  server/
    core/game.ts       Daily seed, guesses, tallies, streaks, outcomes
    core/keys.ts       Every Redis key in one place
    core/post.ts       Game post creation
    routes/            api, menu, triggers
  shared/api.ts        Request/response types shared client and server
```

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/init` | Daily seed, whether you played, your guess, outcome, crowd tally |
| `POST /api/guess` | Lock in HOLD or COLLAPSE (one per player per day) |
| `POST /api/result` | Record the simulated outcome (first write wins) and settle streaks |

### Data model (Redis)

| Key | Contents |
| --- | --- |
| `puzzle:{postId}:{date}` | seed and resolved outcome |
| `guess:{postId}:{date}:{userId}` | the player's call |
| `tally:{postId}:{date}` | HOLD and COLLAPSE counts |
| `streak:{userId}`, `best:{userId}` | current and best streaks |

### Determinism

Bridges are generated with a seeded PRNG (mulberry32) from the UTC date and post id, and simulated with fixed-timestep Matter physics, so every player sees the same structure and the same outcome. The first client to finish the simulation records the canonical result.

## Commands

```bash
npm install        # install dependencies
npm run build      # vite build -> dist/client + dist/server
npm run dev        # devvit playtest (requires devvit login)
npm run deploy     # upload a new version
```
