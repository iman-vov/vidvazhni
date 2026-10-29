#!/usr/bin/env bash
# Bot-strength bench (docs/design/bot-strength.md): s1–s10, s15, s20, one pair and one trio, 8 seeds
# each, one vitest process per scenario, 6 at a time. Act I at level 2, Act II at 3, Act III at 5.
#   tools/bot-bench.sh out/bench/<label>      then: node tools/bot-bench-report.mjs out/bench/<label>
# Progress: wc -l out/bench/<label>/*.jsonl (16 lines per scenario when done).
# BOT_REV=<commit> plays the bot of that commit (e.g. the one before the bot-strength work, 91d3efe).
set -u
OUT=${1:?output dir}
SEEDS=${SEEDS:-8}
SCEN=${SCEN:-"s1 s2 s3 s4 s5 s6 s7 s8 s9 s10 s15 s20"}
PARTIES=${PARTIES:-"warden,elementalist;warden,rogue,elementalist"}
mkdir -p "$OUT"
# The bot as it is now: later edits to tests/replay/bot.ts don't leak into a running bench.
if [ -n "${BOT_REV:-}" ]; then git show "$BOT_REV:tests/replay/bot.ts"; else cat tests/replay/bot.ts; fi |
  sed "s#'\.\./\.\./#'../../../#g" > "$OUT/bot.ts"
level() { case $1 in s[1-5]) echo 2;; s[6-9]|s10) echo 3;; *) echo 5;; esac; }
for sc in $SCEN; do echo "$sc $(level "$sc")"; done | xargs -P 6 -L 1 bash -c '
  SIM=1 SIM_BOT='"$OUT"'/bot.ts SIM_SCENARIO=$0 SIM_LEVELS=$1 SIM_SEEDS='"$SEEDS"' SIM_PARTIES="'"$PARTIES"'" SIM_OUT='"$OUT"'/$0.jsonl \
    npx vitest run tests/balance/sim.test.ts > '"$OUT"'/$0.log 2>&1'
echo done > "$OUT/DONE"
