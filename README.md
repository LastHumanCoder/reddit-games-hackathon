# Reddit Games Collection

Three games for Reddit, built on [Devvit Web](https://developers.reddit.com/) and playable directly inside Reddit posts.

| Game | Folder | One-liner |
| --- | --- | --- |
| **Will It Hold?** | [`willithold/`](willithold/) | One sketchy bridge a day. A truck is about to cross. Call it: HOLD or COLLAPSE. Physics decides. |
| **Littlewick** | [`township/`](township/) | A tiny persistent town that keeps living while you are gone. Your citizen is your Snoovatar. |
| **Read the Room** | [`readtheroom/`](readtheroom/) | A daily consensus game. The skill is not your opinion, it is predicting what the Reddit crowd will say. |

Each folder is a self-contained Devvit Web app with its own README covering the game, how to play, architecture, and commands.

## Shared stack

- [Devvit Web](https://developers.reddit.com/docs): Reddit's developer platform (interactive posts, Redis, scheduler, realtime)
- [Phaser](https://phaser.io/): 2D game engine with Matter physics (Will It Hold?, Littlewick)
- [React](https://react.dev/): UI layer (Read the Room)
- [Hono](https://hono.dev/): server routing
- [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)

## Development

Each app follows the same commands from its own folder:

```bash
npm install        # install dependencies
npm run build      # build client + server bundles
npm run dev        # devvit playtest on a test subreddit
npm run deploy     # upload a new version
```
