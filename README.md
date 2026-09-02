# TypeFlow

A typing speed test built with Next.js 16, React 19, and Tailwind v4. Dark-first and
keyboard-driven, with local-first results plus optional Google sign-in and MongoDB sync.

## Running it

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint    # eslint
npm run db:indexes # create the MongoDB result indexes
npm run db:optimize # preview the bounded-storage migration
npm run db:optimize -- --apply # migrate existing results after reviewing the preview
```

Copy `.env.example` to `.env.local`, fill in the MongoDB, Better Auth, and Google OAuth
values, and register `http://localhost:3000/api/auth/callback/google` as an authorized
Google redirect URI. Signed-out typing continues to work without the server services.

## How it works

| Area | Where |
|---|---|
| Test rules (keystrokes, words, backspace) | `lib/engine.ts` — pure functions over a plain state object |
| WPM / accuracy / consistency math | `lib/metrics.ts` |
| Clock, per-second sampling, scoring | `hooks/useTypingTest.ts` |
| Input handling, caret, line scrolling | `components/typing/TypingArea.tsx` |
| Charts | `components/charts/LineChart.tsx` — hand-rolled SVG, no chart library |
| XP, levels, daily goals, and achievements | `lib/progression.ts` + `app/progress/page.tsx` |
| Persistence | `lib/storage.ts` + `lib/store.ts` locally; MongoDB server actions when signed in |

Notable choices:

- **Accuracy is keystroke-based and monotonic.** Backspacing a mistake fixes the text
  but never repairs the accuracy number, so the score reflects what actually happened.
- **Elapsed time is always derived** from `performance.now()`, never accumulated, so a
  throttled background tab cannot inflate or deflate a score.
- **Consistency** is `1 - coefficient of variation` over the per-second raw WPM samples.
- **Modes**: timed (15s / 30s / 60s / custom), fixed word counts, and quotes.
- **Difficulty**: Easy uses short common words, Normal uses balanced vocabulary, and Hard
  adds longer words, capitals, punctuation, and numbers. Scores stay separate by level.
- **Adaptive practice**: records mistyped character pairs and problem words, then builds
  targeted 50-word sessions from the latest results.
- **Per-key accuracy**: stores correct and incorrect attempts by expected key, then turns them
  into a QWERTY heatmap, finger-level accuracy, confusion pairs, and problem-word analytics.
- **Daily challenge**: one deterministic 50-word test shared by everyone, with a best-attempt
  leaderboard that resets at midnight IST.
- **Progression**: every valid test earns volume, accuracy, duration, and difficulty XP. Three
  daily goals, streak bonuses, levels, and 17 one-time achievement badges reward consistency.
- **Shortcuts**: `Tab` restarts, `Esc` unfocuses, typing anything starts the test.

The leaderboard ranks each signed-in user's best MongoDB result for the selected mode.

## Database retention

MongoDB keeps the latest 200 result summaries and latest 20 detailed sample graphs per user.
Unusually long tests are downsampled to at most 120 graph points before persistence.
Personal bests, cumulative key/word analytics, and one compact progression document per user live
in dedicated collections, so pruning history does not affect leaderboards, adaptive analytics, XP,
or achievements. Daily leaderboard rows expire
after 90 days. Run `npm run db:optimize` before deploying this storage layout, review the report,
then run it again with `-- --apply` to backfill and prune existing data safely.
