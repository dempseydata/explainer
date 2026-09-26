#!/bin/sh
# PROTOTYPE — M0 capture spike sweep. Appends one JSON line per run to results.jsonl.
set -e
r() { node capture.mjs "$@" | tee -a results.jsonl; }
: > results.jsonl
for w in 1 2 4 6 8; do r --pack pencil --workers $w; done
r --pack pencil --workers 6 --format jpeg
r --pack pencil --workers 6 --encoder vt
r --pack pencil --workers 6 --format jpeg --encoder vt
r --pack pencil --workers 6 --shot pw
r --pack pencil --workers 6 --nodedup
for w in 1 4; do r --pack standard --workers $w; done
r --pack standard --workers 1 --nodedup
