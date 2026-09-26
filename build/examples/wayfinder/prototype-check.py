# PROTOTYPE — throwaway. Checks script.yaml against the frozen v0.1 rules (ADR-0002) and
# prints what it finds. Not the M1 validator, which is built test-first in Node.
# Run: uv run --with pyyaml python build/examples/wayfinder/prototype-check.py
import re, sys, yaml
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
s = yaml.safe_load((HERE / "script.yaml").read_text())
VERBS = {"reveal", "hide", "set_state", "highlight", "annotate", "focus"}

def norm(t):  # whitespace, case, Markdown emphasis and code marks, typographic punctuation
    t = re.sub(r"[*_`]", "", t).translate(str.maketrans("‘’“”–—", "''\"\"--"))
    return re.sub(r"\s+", " ", t).strip().lower()

extracts = {src["id"]: norm((ROOT / src["path"]).read_text()) for src in s["sources"]}
g = s["graph"]
groups = {x["id"]: x for x in g["groups"]}
nodes = {x["id"]: x for x in g["nodes"]}
edges = {x["id"]: x for x in g["edges"]}
ids = [*groups, *nodes, *edges]
problems = [f"id {i} used twice" for i in set(ids) if ids.count(i) > 1]

def check(where, cite):
    for c in cite if isinstance(cite, list) else [cite]:
        if not isinstance(c, dict):
            problems.append(f"{where}: bare source id, no quote")
        elif norm(c["quote"]) not in extracts[c["src"]]:
            problems.append(f"{where}: quote not in {c['src']}: {c['quote']!r}")

for x in g["groups"]:
    check(f"group {x['id']}", x["cite"])
    if x["type"] not in g["group_types"] or x.get("parent", "map") not in groups:
        problems.append(f"group {x['id']}: bad type or parent")
for x in g["nodes"]:
    check(f"node {x['id']}", x["cite"])
    if x["type"] not in g["node_types"] or x.get("group", "map") not in groups or len(x["label"]) > 30:
        problems.append(f"node {x['id']}: bad type, group or label")
for x in g["edges"]:
    check(f"edge {x['id']}", x["cite"])
    if x["kind"] not in g["edge_kinds"] or not {x["from"], x["to"]} <= set(groups) | set(nodes):
        problems.append(f"edge {x['id']}: bad kind or end")

total = 0
for i, st in enumerate(s["steps"], 1):
    total += st["duration_s"]
    check(f"step {i}", st["cite"])
    if len(st["actions"]) > 3:
        problems.append(f"step {i}: {len(st['actions'])} actions")
    for a in st["actions"]:
        (verb, arg), = a.items()
        tgt = arg["target"] if isinstance(arg, dict) else arg
        if verb not in VERBS:
            problems.append(f"step {i}: unknown verb {verb}")
        if verb == "set_state" and arg["state"] not in g["states"]:
            problems.append(f"step {i}: undeclared state {arg['state']}")
        if verb == "annotate" and len(arg["text"]) > 30:
            problems.append(f"step {i}: annotation over 30 chars")
        for t in tgt if isinstance(tgt, list) else [tgt]:
            if t not in ids:
                problems.append(f"step {i}: {verb} targets unknown id {t}")
    print(f"step {i:2} {st['duration_s']:>2}s  {len(st['actions'])} actions  {st['narration']}")

print(f"\n{len(s['steps'])} steps, {total} s; {len(groups)} groups, {len(nodes)} nodes, {len(edges)} edges")
print("\n" + ("\n".join(problems) if problems else "no problems"))
sys.exit(1 if problems else 0)
