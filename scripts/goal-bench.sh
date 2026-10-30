#!/usr/bin/env bash
# Every goal benchmark case with one approach, one capped process each (one at a time).
#   scripts/goal-bench.sh <approach> [max MB] [max seconds] [cases...]
set -u
approach=$1 mb=${2:-800} secs=${3:-60}
shift $(( $# < 3 ? $# : 3 ))
cases=${*:-d7-s5 d7-s11 d7-s23 d15-s5 d15-s11 d15-s23 d25-s5 d25-s11 d25-s23 long7 long15 d15-excl}
cd "$(dirname "$0")/.."
for c in $cases; do
  scripts/capped.sh "$mb" "$secs" bun test/experiments/goal-bench.ts "$approach" "$c" 2>&1 | tr '\n' ' '
  echo
done
