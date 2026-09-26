# PROTOTYPE — throwaway. Checks the hand-written script against the brief's v0.1 rules and
# prints what it finds. Not the M1 validator.
# Run: uv run --with pyyaml python build/examples/wayfinder/prototype-check.py
import re, sys, yaml
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
s = yaml.safe_load((HERE / "script.prototype.yaml").read_text())

def norm(t, fold=False):  # brief: whitespace, case, Markdown emphasis and code marks
    t = re.sub(r"[*_`]", "", t)
    if fold:
        t = t.translate(str.maketrans("‘’“”–—", "''\"\"--"))
    return re.sub(r"\s+", " ", t).strip().lower()

extracts = {src["id"]: (ROOT / src["path"]).read_text() for src in s["sources"]}
g = s["graph"]
nodes = {n["id"]: n for n in g["nodes"]}
edges = {e.get("id"): e for e in g["edges"]}
groups = {n["group"] for n in g["nodes"] if "group" in n}
ids = set(nodes) | set(edges) | groups
problems = []

def cites(c):
    return c if isinstance(c, list) else [c]

def check_quote(where, c):
    if not isinstance(c, dict):
        problems.append(f"{where}: bare source id, no quote")
        return
    text = extracts[c["src"]]
    if norm(c["quote"]) in norm(text):
        return
    near = " (passes with typographic folding)" if norm(c["quote"], True) in norm(text, True) else ""
    problems.append(f"{where}: quote not in {c['src']}{near}: {c['quote']!r}")

for n in g["nodes"]:
    [check_quote(f"node {n['id']}", c) for c in cites(n["cite"])]
    if len(n["label"]) > 30:
        problems.append(f"node {n['id']}: label over 30 chars")
for e in g["edges"]:
    [check_quote(f"edge {e.get('id')}", c) for c in cites(e["cite"])]
    for end in (e["from"], e["to"]):
        if end not in nodes:
            problems.append(f"edge {e.get('id')}: unknown end {end}")

total = 0
for i, st in enumerate(s["steps"], 1):
    total += st["duration_s"]
    [check_quote(f"step {i}", c) for c in cites(st["cite"])]
    if len(st["actions"]) > 3:
        problems.append(f"step {i}: {len(st['actions'])} actions")
    for a in st["actions"]:
        (verb, arg), = a.items()
        if verb == "set_state":
            pairs = [(arg["target"], arg["state"])] if "target" in arg else list(arg.items())
            for tgt, state in pairs:
                if state not in g["states"]:
                    problems.append(f"step {i}: undeclared state {state}")
                targets = tgt if isinstance(tgt, list) else [tgt]
        elif verb == "annotate":
            targets = list(arg)
        else:
            targets = arg if isinstance(arg, list) else [arg]
        for t in targets:
            if t not in ids:
                problems.append(f"step {i}: {verb} targets unknown id {t}")
    print(f"step {i:2} {st['duration_s']:>2}s  {len(st['actions'])} actions  {st['narration']}")

print(f"\n{len(s['steps'])} steps, {total} s (meta says {s['meta']['duration_s']})")
print(f"{len(nodes)} nodes, {len(edges)} edges, groups used: {sorted(groups)}")
print("\n" + ("\n".join(problems) if problems else "no problems"))
sys.exit(1 if problems else 0)
