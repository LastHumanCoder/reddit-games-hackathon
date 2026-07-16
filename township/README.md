# Littlewick

A tiny persistent town that lives inside a Reddit post and keeps running while you are gone. Your citizen is your **Snoovatar**. Crops grow, timers finish, and the town changes whether you are watching or not.

Built on [Devvit Web](https://developers.reddit.com/) with [Phaser 3](https://phaser.io/).

## How to play

1. Open the town post. The town is alive: citizens walking between buildings, a day/night cycle, a ticker of recent events.
2. Tap **Claim your citizen**. Pick a trade (Baker, Carpenter, Farmer, Brewer). Your citizen spawns wearing your Snoovatar and exists in the town 24/7 from then on.
3. Start tasks with real-world timers (bake bread, mill lumber). Close the post. Life goes on.
4. Come back later to collect finished work, earn coins and materials, and start the next task.
5. Check in daily to keep your prosperity up: your citizen and house visibly flourish with a streak, and get comically overgrown if you drift away. One tap tidies it back up.

What your citizen is doing on screen reflects your actual state: working means a task is running, idle means nothing is queued, celebrating means you hit a streak milestone.

## Design

Cozy flat paper-cutout storybook style: simple geometric buildings, warm pastel palette, day/night tint. Snoovatar portraits are rendered on small walking bodies. All art is generated in code or composed from Reddit's own avatar system, with a fallback sprite set when a Snoovatar is unavailable.

## Architecture

Devvit Web app: Phaser client, Hono server, Redis state.

```
src/
  client/
    splash.html/.ts    In-feed teaser
    game.html/.ts      Expanded town view
    scenes/            Preloader, Town (ambient simulation and input)
    world/             Layout, procedural textures, citizen sprites
    ui.ts              HUD, claim flow, task panels
  server/
    core/town.ts       Town state, tasks, timers, economy
    core/citizens.ts   Claim flow, trades, prosperity, streaks
    core/post.ts       Town post creation
    routes/            api, menu, triggers
  shared/              Types shared client and server
```

### Data model (Redis)

| Key | Contents |
| --- | --- |
| `town` | era, buildings, weather, world time |
| `citizen:{userId}` | trade, streak, prosperity, coins, materials, tasks |
| `eventlog` | recent world events (feeds the ticker) |

## Commands

```bash
npm install        # install dependencies
npm run build      # vite build -> dist/client + dist/server
npm run dev        # devvit playtest (requires devvit login)
npm run deploy     # upload a new version
```
