#!/bin/sh
# PROTOTYPE — 3× runs of the chosen settings, appended to medians.jsonl.
: > medians.jsonl
for i in 1 2 3; do
  for w in 1 4; do
    node capture.mjs --pack pencil --workers $w --format jpeg | tee -a medians.jsonl
    node capture.mjs --pack standard --workers $w --format jpeg | tee -a medians.jsonl
  done
done
