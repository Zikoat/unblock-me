#!/usr/bin/env bash
# Run an experiment with a hard memory cap and a time limit, and report its time and peak
# memory. The kernel kills it at the cap, so it can never starve the VM.
#   scripts/capped.sh <max MB> <max seconds> <command...>
set -u
mb=$1 secs=$2
shift 2
systemd-run --user --scope -q -p MemoryMax="${mb}M" -p MemorySwapMax=0 \
  /usr/bin/time -f "time %es, peak %MKB" timeout "$secs" "$@"
code=$?
case $code in
  124) echo "stopped: over ${secs}s" >&2 ;;
  137) echo "killed: over ${mb}MB" >&2 ;;
esac
exit $code
