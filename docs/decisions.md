# Decisions

Newest entry last. A timed line saying what was chosen, and what it was chosen over.

This file exists because an agent's own memory lives on one laptop, for one tool, for one person —
and there are three of us and two different agents. If it is not written here it does not exist
an hour from now. Keep entries short; the reasoning matters more than the prose.

```
**14:20 — <what was chosen>.**
<why, in two or three lines>. Chosen over: <the alternative, and why not>.
```

---

**14:40 — Case: Track 2 «Граф денег».**
It suits the team: the core is a graph algorithm (the analytics owner), an analyst assistant over tools (the agent owner)
and a network screen (the lead).

**14:40 — The pipeline is TypeScript in this repo, not Python.**
One runtime means one install for the jury, whose failure to run the project eliminates us
(§5.4.16). The agent tools call the same functions that produce the CSVs. Our PageRank, HITS and
betweenness were checked against networkx on all 2 248 nodes and differ by less than 1e-14. The
full compute takes 0.35 s. Chosen over: a Python pipeline with networkx. The ТЗ only *recommends*
it, it needs a second runtime, and the organiser's own starter crashes on a clean machine
(`nx.pagerank` needs scipy, which its requirements do not list).

**14:40 — Sigma.js (WebGL) with a layout precomputed by ForceAtlas2 in the pipeline.**
It shares graphology with the clustering. WebGL handles 2 248 nodes with a wide margin. A
precomputed layout keeps the picture identical on every run, which matters for a demo. Chosen over:
Cytoscape.js (canvas, near its limit, synchronous layout), Reagraph (three.js weight, layout in the
browser) and react-force-graph (a live layout that keeps moving).

**14:40 — `data/*.parquet` is committed.**
Must-have 1 demands a run with no manual steps. The files are 87 KB and the licence allows use
within the hackathon. Chosen over: asking the jury to place the archive.

**14:40 — Exactly the six ТЗ roles. Truncation is a flag.**
The CSV is checked mechanically against the dictionary. A depth-4 node with no outgoing transfers
is never `terminal`: it is `peripheral` or `consolidator`, carries `truncated` and has its
`role_score` capped. Chosen over: a seventh role, which is allowed but risks the mechanical check.

**14:40 — The app reads `output/analysis.json` written by the pipeline, and `predev` and
`prebuild` run the pipeline.**
Tool handlers are synchronous, and parsing parquet per request is pointless for a batch dataset.
The output dir is `output/`, because `out/` is gitignored as Next's export dir. Chosen over:
computing on the first request (async inside sync tools).

**14:40 — A gid is a string, a date is a `'YYYY-MM-DD'` string.**
Gids are ~1e17, above `Number.MAX_SAFE_INTEGER`. `Number(gid)` silently merges distinct clients.

**14:40 — The UI and all generated text are in Russian. The code is in English.**

**14:55 — Live model: OpenAI `gpt-6-luna` through the Responses adapter.**
The budget is $50. It costs $0.10 per 1M input tokens and $0.50 per 1M output. It called a
function tool correctly on the first try with 0 reasoning tokens. A demo turn of ~15k input and
~1k output tokens costs about $0.002. Chosen over: `gpt-5.6-luna` (2× the price, spends reasoning
tokens), `gpt-5-mini` (6× the reasoning tokens) and `gpt-6-sol` (20× the price; the fallback only
if luna's answers are weak). `.env.example` stays on `mock` for reviewers.

**15:15 — CSV conventions (the agent owner, `graph/repo/outputs.ts`).**
The ТЗ's columns come first and in its order; our metrics follow them (the organiser's README
permits extra columns). Gids are plain digits, booleans `true`/`false`, a missing value an empty
cell, lists (`top_gids`, `flags`) joined with `|` — the separator the lead fixed in the plan's
Requests at 15:25. LF, UTF-8, no BOM — what pandas reads without options. Chosen over: a JSON
array in `top_gids`, which needs quoting and a second parser.

**15:15 — The top list holds 50 rows, not 20.**
The ТЗ asks for ≥ 20; `get_top_nodes` accepts `limit` up to 50 and serves it from `analysis.top`
without re-ranking. `TOP_LIMIT` in `graph/usecase/analyze.ts`.

**15:15 — `readAnalysis` returns `null` for a missing file and throws for an invalid one.**
Missing means "the pipeline has not run" — an empty state. Invalid means a bug — an error state
with the first issues named. Folding both into `null` would send someone to re-run a pipeline that
is not what is broken. The pipeline reads its own output back through the same function, so a
file the app cannot load fails the run, not the demo.

**15:15 — Layout: ForceAtlas2, 300 iterations, from a circle in gid order.**
Deterministic (identical `analysis.json` hash across runs), about 4 s of the pipeline's 4.4 s.
Edge weight is `log10(1 + sumKzt)` so one 3M transfer does not fold the picture. Chosen over: fewer
iterations (a looser picture) and a random start (a different picture on every run).

**15:45 — The graph tools (the agent owner, `graph/usecase/tools.ts`) refuse, cap, and keep the global rank.**
An unknown gid or cluster is a returned `{ refused: true, reason }`, never a throw; a missing
`analysis.json` is a throw, so the panel row says "failed" and names `pnpm pipeline`. Lists going
back to the model are capped (20 collectors, 60 flow edges, 10 cluster members) and always carry
the total. `get_top_nodes` with a role or cluster filter ranks all 2 248 nodes and keeps the global
rank rather than renumbering. `ToolSpec`/`defineTool` moved to `agent/usecase/defineTool.ts` so a
domain's tools can be built without importing the registry that imports them (a cycle).

**15:45 — The mock agent is keyed on word stems and reads «этих пятерых» from the previous answer.**
`agent/usecase/mock.ts`. «собира» → `find_collectors`, «убра/удал» → `simulate_removal`, a named gid
→ `get_node`, default → `get_top_nodes` + `get_node` on #1. The sources of «этих» are the gids the
question names, else the gids of the previous reply, else a visible `get_top_nodes(5)` call. Chosen
over: a fixed script by message index, which breaks the moment the jury asks out of order.

**15:53 — Live run on `gpt-6-luna` (Responses): all three demo questions answered through tools.**
After `pnpm pipeline` on the analytics owner's model (`1977adf`; 7.9 s; 1333 peripheral, 639 terminal, 110
consolidator, 72 coordinator, 57 transit, 37 distributor; 84 clusters). One conversation, three
turns: «кого первым» → `get_top_nodes(10)` + five `get_node` (21 s); «кто собирает с этих пятерых»
→ `find_collectors` on the five gids of the previous answer, `maxHops` 3 (11 s); «что если убрать
топ-5» → `get_top_nodes(5)` + `simulate_removal` (9 s; 35 → 122 components, largest 1 877 → 1 733).
No tool errors, every number traceable to a result, phrased as hypotheses. The first turn is the slow
one (six calls): acceptable live, and the mock stays the default for reviewers.

**16:45 — Layout: ForceAtlas2 with dissuaded hubs and strong gravity, 500 iterations (the lead, in the agent owner's `layout.ts` with his agreement).**
Five settings were rendered side by side on the real data. The inferred defaults gave one dense ball; LinLog an even disc. `outboundAttractionDistribution` + `scalingRatio 10` + `strongGravityMode` (gravity 0.05) shows distributors as fans and consolidator groups apart, which is what the analyst needs to see at a glance. ~6 s pipeline. Chosen over: the defaults (no structure) and LinLog (no structure, slower).
