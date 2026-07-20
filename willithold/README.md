# Will It Hold?

A new sketchy bridge every 6 hours. A truck is about to cross it. You have one call to make: **HOLD** or **COLLAPSE**. Then real physics decides who was right.

Built on [Devvit Web](https://developers.reddit.com/) with [Phaser](https://phaser.io/) and Matter physics. Everything on screen is drawn in code; every verdict comes from a live rigid-body simulation, not a canned animation.

## How to play

1. Open a bridge post. You see that post's bridge: a procedurally generated wooden suspension bridge of questionable structural integrity, with a truck waiting at the edge.
2. Study it. Count the hangers. Eye the joints. Somewhere around 40% of these bridges are secretly doomed.
3. Tap **HOLD** (it will survive) or **COLLAPSE** (it will not). One call per player per bridge.
4. The simulation runs. The truck drives. Four seconds later you are either smugly correct or watching the deck fold into the ravine.
5. The verdict card shows whether you called it, the community split, your accuracy and rank, your streak, and a roast from the announcer.
6. A fresh bridge is posted every 6 hours. Old posts stay playable forever as their own bridges.

Already made your call on a bridge? Reopening that post replays its simulation and shows the verdict. After your call you can keep playing **practice bridges**: endless random structures that sharpen your eye without touching your streak.

## Why it is interesting

- **Same bridge for everyone.** Each post's structure is generated from a seed derived from the post id, so the whole subreddit argues about one bridge, like a crossword with load-bearing consequences.
- **The crowd is part of the score.** Beating the bridge is fun. Being in the correct 36% while 64% of Reddit got it wrong is delicious.
- **Real simulation.** Deck planks are physics bodies joined by constraints with seeded stiffness. Weak joints, missing hangers, and heavy trucks interact honestly. The generator aims for ambiguity: the best bridges split the crowd near 50/50.

## Architecture

Devvit Web app: Phaser client, Hono server, Redis state, types shared via `src/shared/api.ts`.

```
src/
  client/
    splash.html/.ts    In-feed teaser (sunset, bridge, one button)
    game.html/.ts      Expanded game entrypoint
    sound.ts           WebAudio synth (ambient loop + SFX, no asset files)
    scenes/            BridgeScene: generation, simulation, UI
  server/
    core/game.ts       Per-post seed, guesses, tallies, streaks, stats
    core/keys.ts       Every Redis key in one place
    core/post.ts       Numbered game post creation
    routes/            api, menu, scheduler, triggers
  shared/api.ts        Request/response types shared client and server
```

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/init` | Post seed, whether you played, your guess, outcome, crowd tally |
| `POST /api/guess` | Lock in HOLD or COLLAPSE (one per player per bridge) |
| `POST /api/result` | Record the simulated outcome (first write wins) and settle streaks |
| `GET /api/leaderboard` | Top streaks plus your row |

A scheduler task (`0 */6 * * *`) creates a new numbered bridge post at 00/06/12/18 UTC. Moderators can also post one on demand from the subreddit menu.

### Data model (Redis)

| Key | Contents |
| --- | --- |
| `puzzle:{postId}` | seed and resolved outcome |
| `guess:{postId}:{userId}` | the player's call |
| `tally:{postId}` | HOLD and COLLAPSE counts |
| `streak:{userId}`, `best:{userId}` | current and best streaks |
| `stats:{userId}` | games, correct calls, recent results |
| `bridge_counter` | number of the next bridge post |

### Determinism

Bridges are generated with a seeded PRNG (mulberry32) from the post id, and simulated with fixed-timestep Matter physics, so every player sees the same structure and the same outcome. A post's bridge never changes. The first client to finish the simulation records the canonical result.

## Commands

```bash
npm install        # install dependencies
npm run build      # vite build -> dist/client + dist/server
npm run dev        # devvit playtest (requires devvit login)
npm run deploy     # upload a new version
```
