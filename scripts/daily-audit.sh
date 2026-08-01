#!/usr/bin/env bash
#
# Daily optimisation loop for openaffiliate.dev.
#
# Wakes once a day, measures the site, and opens a PR only when it finds
# something real. Decides for itself whether to merge. The brief it works from
# is docs/internal-loop-spec.md — edit that to change what the loop does, not
# this file, which only sets up the run.
#
# Install:  crontab -e  →  17 9 * * * /Users/sonpiaz/open-affiliate/scripts/daily-audit.sh
# Logs:     ~/.openaffiliate-loop/<date>.log
# Disable:  touch ~/.openaffiliate-loop/PAUSED

set -uo pipefail

REPO="/Users/sonpiaz/open-affiliate"
LOOP_HOME="$HOME/.openaffiliate-loop"
LOG="$LOOP_HOME/$(date +%Y-%m-%d).log"

mkdir -p "$LOOP_HOME"

# A kill switch that does not require editing crontab.
if [ -f "$LOOP_HOME/PAUSED" ]; then
  echo "[$(date +%H:%M:%S)] paused, skipping" >> "$LOG"
  exit 0
fi

cd "$REPO" || { echo "repo not found at $REPO" >> "$LOG"; exit 1; }

# Start from a clean, current main. A run that begins on a stale or dirty tree
# produces diffs nobody asked for.
git fetch --quiet origin
if [ -n "$(git status --porcelain)" ]; then
  echo "[$(date +%H:%M:%S)] working tree dirty, skipping run" >> "$LOG"
  exit 0
fi
git checkout --quiet main && git pull --quiet --ff-only

{
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "run start $(date '+%Y-%m-%d %H:%M:%S')  @ $(git rev-parse --short HEAD)"
  echo "════════════════════════════════════════════════════"
} >> "$LOG"

# The prompt lives in its own file rather than a heredoc here: macOS ships
# bash 3.2, which mis-parses a quoted heredoc inside $( ) when the body
# contains an apostrophe. Keeping it separate also lets the loop revise its
# own brief without editing this launcher.
PROMPT_FILE="$REPO/scripts/daily-audit-prompt.md"

# Fail loudly. Without this the first real run exited 0 while claude rejected
# an empty prompt, which would have looked like a clean no-findings day every
# day until someone read the log.
if [ ! -f "$PROMPT_FILE" ]; then
  echo "[$(date +%H:%M:%S)] FATAL: prompt file missing at $PROMPT_FILE" >> "$LOG"
  exit 1
fi

claude -p "$(cat "$PROMPT_FILE")" >> "$LOG" 2>&1
CLAUDE_EXIT=$?
if [ "$CLAUDE_EXIT" -ne 0 ]; then
  echo "[$(date +%H:%M:%S)] run failed, claude exited $CLAUDE_EXIT" >> "$LOG"
fi

echo "run end $(date '+%H:%M:%S')" >> "$LOG"
