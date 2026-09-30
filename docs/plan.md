# Plan

Written at 14:40 by the lead, from the task's ТЗ. Changed only by the lead; anyone may add to
**Requests**. Every agent reads this before starting work and again after every pull. The rules
for writing it are in `AGENTS.md`, under **Every plan is split into lanes**.

Decisions behind this plan are in `docs/decisions.md` (14:40 entries).

---

## Task

Track 2, «Граф денег» (source: `Трек 2 финансы.docx`, dataset `README.md`, organiser starter).
From a 4-hop graph of outgoing transfers from 81 known drug-trade clients (2 248 nodes, 3 119 edges,
4 840 transactions, July 2026), assign every node a role, a cluster and a priority, and show the
analyst **"whom of these 2 248 to check first, and why"**.

The evaluation turns on: *"the jury names 3 random gids; the team explains in one minute why the
role is what it is, from its own metrics."* Every role is a formal rule with a threshold, and every
row carries its evidence with numbers.

Hard gates (must-have 1–5):

1. `pnpm pipeline` goes from raw `data/*.parquet` to `output/nodes_roles.csv`,
   `output/clusters.csv` and `output/top_nodes.csv` in one run, in under 5 minutes, on a clean
   machine.
2. `nodes_roles.csv` has exactly 2 248 rows. `gid, role, role_score, cluster_id, priority_score,
   evidence` are all filled, and `evidence` holds numbers.
3. Each role's rule and thresholds are documented in the README and exported in `analysis.json`.
4. `clusters.csv` has `cluster_id, n_nodes, n_seed, sum_kzt_internal, top_gids, hypothesis`, and
   every node has a `cluster_id`.
5. `top_nodes.csv` has at least 20 rows (`rank, gid, role, priority_score, why`). A screen shows
   the network with flow direction and roles, and can find any gid.

## Scenario

The analyst opens the app, sees the whole network coloured by role with the priority list beside
it, and asks the assistant «кого проверять первым и почему?» or «кто собирает деньги с этих
пятерых?». The agent calls graph tools, and the activity panel shows each call. Clicking any gid in
the answer, the list or the search box focuses that node on the graph and opens its card.

User-facing text is **Russian**: UI copy, `evidence`, `why`, `hypothesis`, agent replies. Code and
identifiers are English. Conclusions are phrased as hypotheses («признаки консолидации»), never as
guilt.

## Stack facts everyone needs

- **The pipeline is TypeScript** and runs with
  `tsx --conditions=react-server scripts/pipeline.ts`. The condition makes `import 'server-only'`
  resolve to its empty module outside Next. It was checked at 14:30.
- **Dependencies (the lead adds them, nobody else):** `hyparquet`, `hyparquet-compressors` (the
  files are **ZSTD**), `graphology`, `graphology-communities-louvain`,
  `graphology-layout-forceatlas2`, `sigma`, `@react-sigma/core`.
- **A `gid` is a string, everywhere.** Values are ~1e17, above `Number.MAX_SAFE_INTEGER`, so
  hyparquet returns them as `bigint`. Convert them with `String()` at read time and never pass one
  through `Number`.
- **A date is a `'YYYY-MM-DD'` string.** hyparquet returns UTC-midnight `Date`s. Take
  `toISOString().slice(0, 10)` at read time and compare the strings.
- **Measured on the real data:** hyparquet reads all three files in 44 ms, and Louvain takes
  12 ms. Our own PageRank, HITS and Brandes betweenness were checked against networkx on every node
  and match to 1e-14. The full compute takes 0.35 s.
- **Numbers to calibrate against:**

  | Measure | Count |
  | --- | --- |
  | `in_deg` ≥ 2 / 3 / 5 / 8 / 12 / 20 | 446 / 200 / 51 / 17 / 5 / 1 (max 24) |
  | `out_deg` ≥ 2 / 3 / 5 / 10 / 30 / 60 / 100 | 375 / 237 / 131 / 64 / 18 / 8 / 2 (max 116) |
  | Nodes with both in and out | 671 |
  | Non-seed nodes with `pass_through` 0.8–1.2 | 70 |
  | Truncated (depth 4, no out) | 444 |
  | No out and depth < 4 (terminal candidates) | 1 091 |
  | Louvain communities / with more than one seed | 45 / 8 |
  | Weakly connected components | 35 (16 plus 19 isolated seeds) |
  | Transaction amount p10 / p50 / p90 / max | 7k / 30k / 200k / 3M KZT |

- **Outputs go to `output/`, not `out/`.** `out/` is gitignored, because it is Next's export dir.
  The three CSVs are a required artifact, so `output/` is committed at the end.
- The page reads `output/analysis.json`, which the pipeline writes. Tool handlers are synchronous
  (`executeTool` is sync), so the app never parses parquet at request time. `predev` and
  `prebuild` run the pipeline, so a fresh clone cannot start with no analysis.

## Contract — frozen at 15:10

Schema: `src/server/graph/model/graph.schema.ts`. Owner: the lead. It is written first, then frozen.
It contains zod schemas and types for:

| Type | Fields |
| --- | --- |
| `Role` | `'consolidator' \| 'transit' \| 'distributor' \| 'terminal' \| 'coordinator' \| 'peripheral'`. Exactly the six from the ТЗ. Truncation is a **flag**, not a seventh role. |
| `RawGraph` | `nodes: {gid, depth, isSeed}[]`, `edges: {src, dst, sumKzt, nTx, depth}[]`, `transactions: {src, dst, date, sumKzt}[]` |
| `NodeMetrics` | `gid, depth, isSeed, inDeg, outDeg, inKzt, outKzt, inTx, outTx, passThrough (number \| null), pagerank, hub, authority, betweenness, seedsUpstream, fastTransitShare, truncated` |
| `RoleVerdict` | `role, roleScore (0–1), evidence (≤200 chars, RU, with numbers), flags: string[]` |
| `NodeRow` | `NodeMetrics & RoleVerdict & {clusterId, priorityScore, x, y}` |
| `EdgeRow` | `src, dst, sumKzt, nTx, depth, firstDate, lastDate` |
| `ClusterRow` | `clusterId, nNodes, nSeed, sumKztInternal, topGids: string[], hypothesis` |
| `TopRow` | `rank, gid, role, priorityScore, why` |
| `Analysis` | `stats, thresholds: Record<string, number>, nodes: NodeRow[], edges: EdgeRow[], clusters: ClusterRow[], top: TopRow[]` |
| `NodeCard` | `node: NodeRow, topIn: {gid, sumKzt, nTx}[], topOut: {gid, sumKzt, nTx}[]` (up to 5 each) |

### Pure functions — the analytics owner, `src/server/graph/model/*.ts`

All are synchronous and pure, with no I/O. Stub files carrying these exact signatures land first
(peripheral, 0, cluster 0), so the other lanes compile from minute one.

| File | Signature |
| --- | --- |
| `metrics.ts` | `computeMetrics(raw: RawGraph): Map<string, NodeMetrics>` |
| `roles.ts` | `ROLE_THRESHOLDS: Record<string, number>` · `assignRoles(raw: RawGraph, m: Map<string, NodeMetrics>): Map<string, RoleVerdict>` |
| `clusters.ts` | `detectClusters(raw: RawGraph): Map<string, number>` · `summarizeClusters(raw: RawGraph, nodes: NodeRow[]): ClusterRow[]` |
| `priority.ts` | `scorePriority(nodes: Omit<NodeRow, 'priorityScore'>[]): Map<string, number>` · `rankTop(nodes: NodeRow[], limit: number): TopRow[]` |
| `queries.ts` | `nodeCard(a: Analysis, gid: string): NodeCard \| null` · `findCollectors(a: Analysis, input: CollectorsInput): Collector[]` · `traceFlow(a: Analysis, input: FlowInput): Flow` · `simulateRemoval(a: Analysis, gids: string[]): RemovalImpact` · `coverageGaps(a: Analysis): CoverageGap[]`. Lint allows at most two parameters, so a third becomes an input object. |

### I/O and composition — the agent owner

| File | Signature |
| --- | --- |
| `graph/repo/parquet.ts` | `readRawGraph(dataDir: string): Promise<RawGraph>` |
| `graph/repo/outputs.ts` | `writeOutputs(outDir: string, a: Analysis): void`: 3 CSVs plus `analysis.json` |
| `graph/repo/analysis.ts` | `readAnalysis(outDir: string): Analysis \| null`: sync, cached, validated by `analysisSchema` |
| `graph/usecase/layout.ts` | `computeLayout(raw: RawGraph): Map<string, {x: number, y: number}>`: ForceAtlas2 with a fixed seed |
| `graph/usecase/analyze.ts` | `analyze(raw: RawGraph): Analysis`: composes metrics → roles → clusters → layout → priority → top |
| `graph/usecase/getAnalysis.ts` | `getAnalysis(ctx: Ctx): Analysis \| null`: the page's only entry point |
| `scripts/pipeline.ts` | CLI: `--data ./data --out ./output`. Prints the timing and the row counts. |

### Agent tools — the agent owner, `src/server/graph/usecase/tools.ts`, spread into `TOOLS`

All tools are read-only, so none needs confirmation. Each one re-validates its gids exist and
returns a refusal row otherwise.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_top_nodes` | `limit?` (1–50), `role?`, `clusterId?` | `TopRow[]` |
| `get_node` | `gid` | `NodeCard` |
| `get_cluster` | `clusterId` | `ClusterRow` plus its top members |
| `find_collectors` | `gids` (2–20), `maxHops?` (1–4) | nodes reached from ≥2 of the gids, with KZT received |
| `trace_flow` | `gid`, `direction`, `maxHops?` | the sub-graph of edges from or to the gid |
| `simulate_removal` | `gids` | components and seed reach, before and after |
| `coverage_gaps` | — | the missing data, and the next request to make |

## Role rules — starting point for the analytics owner

Tune these against the data, keep every number in `ROLE_THRESHOLDS`, and document the final set in
the README. The rules are applied in this order, first match wins:

1. **Truncated** (depth 4, `outDeg` 0): never `terminal`. It becomes `consolidator` if the
   consolidator rule holds on inputs alone, otherwise `peripheral`. It gets the flag `truncated`,
   `roleScore` ≤ 0.5, and evidence saying «обход остановлен на 4-м колене».
2. **coordinator**: a seed or depth ≤ 1 node whose outgoing money reaches ≥ 2 consolidators or
   distributors within 2 hops, or which is in the top by `hub` and `betweenness`. This is the
   candidate organiser.
3. **distributor**: `outDeg` ≥ 10 and `outDeg` ≥ 3 × `inDeg`, a fan-out (64 nodes at ≥ 10).
4. **consolidator**: `inDeg` ≥ 5, or `inDeg` ≥ 3 with `seedsUpstream` ≥ 2, forwarding little
   (`passThrough` < 0.5 or `outDeg` ≤ 2). There are 51 nodes at `inDeg` ≥ 5.
5. **transit**: in and out both > 0, `passThrough` 0.8–1.2, small degrees. `fastTransitShare`
   (out within 2 days of in) raises the score. For a **seed**, never use `passThrough`: its inflow
   is under-reported by construction.
6. **terminal**: `outDeg` 0, depth < 4, and `inKzt` or `inDeg` above the threshold.
7. **peripheral**: everything else.

`roleScore` is how far the node clears its threshold, clipped to 0–1. **Priority** is a documented
weighted sum of normalised terms: role weight, log of the flow volume, `seedsUpstream`,
`betweenness`, `pagerank`, and the seed density of the node's cluster, with a penalty when
`truncated`. `why` names the two or three terms that dominated, with their values.

## Lanes

Two agents per person, each in its own worktree on the paths listed. Ownership differs from the
`AGENTS.md` table in one place: **the analytics owner owns `graph/model/**`**, which is where the pure algorithm
belongs by the tier rules. **The agent owner owns `graph/repo/**`**, which here is only file I/O.

### The lead — contract, interface, README

- **Paths:** `src/server/graph/model/graph.schema.ts`, `src/app/page.tsx`, `src/app/layout.tsx`,
  `src/app/globals.css`, `src/views/**`, `src/widgets/**`, `src/features/**`, `src/entities/**`,
  `README.md`, `docs/plan.md`, `docs/architecture.md`, `package.json`, `pnpm-lock.yaml`,
  `.env.example`, `data/**`, `docs/solution.svg`
- **Tasks, in order:**
  - [ ] **Chunk 1, contract and setup (by 15:10).** Write `graph.schema.ts` from the table above.
        Add the dependencies. Add the scripts `pipeline`, `predev` and `prebuild`. Copy the three
        parquet files into `data/`. Push, then announce "contract frozen".
  - [ ] **Chunk 2, graph screen (agent A, by 16:30).**
        - `views/graph`: a client-only Sigma canvas (`dynamic(..., { ssr: false })`), fed
          `nodes`/`edges` with the precomputed x/y.
        - Directed arrows, colour by role or by cluster (a toggle), size by priority.
        - Role colours are **tokens** in `globals.css`, read through `getComputedStyle` for Sigma.
        - A legend, because status is never colour alone.
        - Gid search that focuses the node and highlights its neighbours.
        - A side panel: node card (metrics, evidence, top in/out), then the Топ-лист and
          Кластеры tables.
        - Loading, empty ("run `pnpm pipeline`") and error states.
  - [ ] **Chunk 3, assistant in the screen (agent B, by 17:00).** Move the chat UI into
        `widgets/assistant` and dock it beside the graph. Any gid in a tool result is clickable and
        focuses the graph. A «Спросить ассистента» button on the node card fills in a question.
  - [ ] **Chunk 4, README and slide (from 16:00, frozen at 17:00).**
        - README: Russian abstract, run commands, role rules and thresholds (copied from
          `ROLE_THRESHOLDS`), outputs, limitations, the 1M-node scaling section, disclosure of the
          starter, the organiser starter and every dependency.
        - `docs/solution.svg`: data → metrics → roles → interface.
- **Depends on:** the agent owner's `getAnalysis` (16:00). Until then the view renders a 20-node sample
  typed as `Analysis`.
- **Done when:** the jury names a gid, it is found, its links show, and the card explains its role.
  A clean clone runs from the README.

### The agent owner — pipeline, tools, prompt, agent loop

- **Paths:** `src/server/graph/repo/**`, `src/server/graph/usecase/**`,
  `src/server/agent/usecase/**`, `src/app/api/**`, `scripts/pipeline.ts`, `output/**`
- **Tasks, in order:**
  - [ ] **Chunk 1, pipeline end to end (agent A, by 16:00).**
        - Write `readRawGraph`, `computeLayout`, `analyze`, `writeOutputs`, `readAnalysis`,
          `getAnalysis` and `scripts/pipeline.ts`, working against the analytics owner's stubs.
        - The CSV column order is exactly the ТЗ's. Extra columns go after the required ones.
        - The CLI asserts 2 248 rows and ≥ 20 top rows, and fails loudly otherwise.
  - [ ] **Chunk 2, tools and mock (agent B, by 16:30).**
        - The seven tools, with specs.
        - `runMock` scripted for the demo, keyed on intent: «кого первым» → `get_top_nodes` then
          `get_node` on #1. «кто собирает» → `find_collectors`. «что если убрать» →
          `simulate_removal`.
        - The tools read through `readAnalysis`.
  - [ ] **Chunk 3, prompt and live run (by 17:00).**
        - `prompt.ts`: hypotheses, not guilt. Every number comes from a tool. Cite the gids.
          Say what the data cannot show (truncation, seed inflow).
        - Run once against a live model.
        - Commit `output/*.csv` after the final pipeline run.
- **Depends on:** the schema (15:10) and the analytics owner's model functions (real by 16:00; stubs until then).
- **Done when:** `pnpm pipeline` produces valid outputs in seconds, and the mock and live agents
  both answer the three demo questions through real tool calls.

### The analytics owner — metrics, roles, clusters, priority, queries

- **Paths:** `src/server/graph/model/**` except `graph.schema.ts`, `src/server/graph/data/**`
  (small hand-built fixture graphs for the tests)
- **Tasks, in order:**
  - [ ] **Chunk 0 (15:10).** Push the stub files with the exact signatures above.
  - [ ] **Chunk 1, metrics and roles (agent A, by 16:00).**
        - `computeMetrics`: degrees and sums, `passThrough`, PageRank weighted by `sumKzt`, HITS,
          Brandes betweenness, `seedsUpstream`, and `fastTransitShare` from transactions.
        - `assignRoles`, with evidence strings in Russian that carry the numbers, for example
          «получает от 11 плательщиков (3 seed), отдаёт дальше 3% полученного».
        - Unit tests on the fixture graphs, one per role, plus the truncation and seed traps.
  - [ ] **Chunk 2, clusters and priority (agent B, by 16:30).**
        - `detectClusters`: Louvain on the undirected weighted projection. Say so in a comment:
          the ТЗ asks. Use a fixed rng for reproducibility.
        - `summarizeClusters`: hypothesis text generated from the role mix and seed count.
        - `scorePriority` and `rankTop`, with `why`.
  - [ ] **Chunk 3, queries (by 17:00).** `nodeCard`, `findCollectors`, `traceFlow`,
        `simulateRemoval` (weak components and seed reach, before and after), `coverageGaps`.
  - [ ] **Chunk 4, defence (17:00–17:30).** Pick 3 random gids and check each one's evidence
        explains the role in one sentence. Tune the thresholds if not, and hand the final
        thresholds to the lead for the README.
- **Depends on:** only the schema. Everything else is a pure function of `RawGraph`.
- **Done when:** every role has a rule with thresholds, a test, and a gid in the data that shows it.

## Integration points

| What meets what | In which file | By |
| --- | --- | --- |
| Schema → all three lanes | `graph/model/graph.schema.ts` | 15:10 |
| the analytics owner's stubs → the agent owner's `analyze` | `graph/model/*.ts` → `graph/usecase/analyze.ts` | 15:15 |
| Real roles and metrics → CSVs | same | 16:00 |
| `getAnalysis` → the graph screen | `graph/usecase/getAnalysis.ts` → `src/app/page.tsx` | 16:00 |
| Queries → tools | `graph/model/queries.ts` → `graph/usecase/tools.ts` | 17:00 |
| Tool results → clickable gids on the graph | `ToolCall.result` → `widgets/assistant` | 17:00 |
| Final thresholds → README | `ROLE_THRESHOLDS` → `README.md` | 17:15 |

## Hourly checkpoints

What each lane commits by each hour (§5.4.8). **The 14:00 mark was missed.** Commit this plan and
the decisions now. The lead's agent commits its own lane at the end of every phase without being
asked; the person pushes.

| By | the lead | the agent owner | the analytics owner |
| --- | --- | --- | --- |
| 15:00 | Plan and decisions committed. Schema pushed by 15:10. | Parquet reader and CLI skeleton | Stubs, fixture graphs |
| 16:00 | Graph screen on the sample, deps and data in | `pnpm pipeline` → 3 CSVs, 2 248 rows | Metrics and roles with tests |
| 17:00 | Screen on real data plus assistant dock. **README frozen.** | 7 tools, mock scenario, live run | Clusters, priority, queries |
| 18:00 | Demo rehearsed twice, slide | Final `output/*.csv` committed | 3-gid defence notes |

## Demo — 5 minutes

1. `pnpm pipeline`, live: the timing and the counts.
2. The network: colour by role, toggle to clusters, arrows.
3. The Топ-лист #1: the card, the evidence, the neighbours.
4. Ask the assistant «кого проверять первым и почему?», then «кто собирает деньги с этих пятерых?».
   The activity panel fills.
5. `simulate_removal` of the top 5: the network splits into N fragments.
6. What the data cannot show (truncation, seed inflow) and the next request to the bank.

## Requests

A change someone needs in a path they do not own. Newest last.

- *(15:05 — the lead, note)* The contract is frozen: `graph.schema.ts` plus the stubs in
  `graph/model/*.ts`, the dependencies and `data/` are in. The stubs were written by the lead to
  unblock the others sooner. **From now on they are the analytics owner's files.**
- *(15:05 — the agent owner → the lead)* When `pnpm pipeline` works, tell the lead, who then adds
  `"predev": "pnpm pipeline"` and `"prebuild": "pnpm pipeline"` to `package.json`. They are not
  added yet because the pipeline does not exist, and adding them now would break `pnpm dev` for
  everyone.
- *(15:20 — the agent owner → the lead)* `pnpm pipeline` works end to end on the real data: 2 248 rows, 50 top
  rows, 4.4 s, deterministic layout, gate green. **Add `predev` and `prebuild` now.** The page's
  entry point is `getAnalysis(ctx)` in `graph/usecase/getAnalysis.ts`; `null` means "run
  `pnpm pipeline`", a throw means the file is broken (show its message). Roles are all
  `peripheral` and there is one cluster until the analytics owner's rules land — the wiring is real, the numbers
  are stubs. For the README: `top_gids` and `flags` are joined with `|` as you fixed at 15:25; the
  pipeline also writes `output/run_summary.json` (SHA-256 of the inputs, timings, role counts and
  the dataset warnings) — quote it in the limitations section instead of retyping the numbers.
- *(15:35 — the lead, done)* `predev`/`prebuild` added; `/` renders `getAnalysis(createCtx())` with an
  error state for a broken file. Checked on the real data in headless Edge: 2 248 nodes drawn in
  1.4 s, gid search opens the card, no console errors.
- *(16:55 — the lead, README gate)* **Clean clone verified** at `7938a9f`, following the README
  literally with `.env` copied from `.env.example` (mock):
  - `pnpm install --frozen-lockfile`: 26 s
  - `pnpm pipeline`: 7 s, 2 248 rows plus the header
  - `pnpm check`: green
  - `pnpm build`: 48 s. `/` is prerendered, and `prebuild` runs the pipeline first.

  The README is frozen from here, except for facts that change.
- *(16:05 — the lead → the agent owner, review of `c1ea0c8`)* Good. The gate is green, the 7 tools match the
  contract, refusals come back instead of throws, gids are strings, results are ≤ 14 KB, and both
  mock and live answer through real tool calls. Fix these for the demo:
  1. **Prompt:**
     - Role names in Russian: the live reply wrote «distributor».
     - Round metrics to 2 decimals: it printed `passThrough 2.7437165025037142`. Either allow
       rounding in the prompt or round in the tool results.
     - For «кого первым», call `get_top_nodes` plus `get_node` for #1 only. The live answer took
       19.4 s with 6 tool calls.
     - (Markdown `**bold**` is fine: the lead now renders it in the widget.)
  2. **Mock default branch:** an unrelated question («какая погода?») silently returns the top-5.
     Make it say it did not understand and offer the three demo questions.
  3. The prompt hard-codes "81 seeds / 2 248 nodes / July 2026". Fill these in from
     `analysis.stats`.
  4. Nice to have:
     - English leftovers: «Check the clock», "I could not finish", "There is no tool named…".
     - «убрать топ-10» still removes 5.
     - `totalMatching` says 50, not 2 248.
- *(16:10 — the agent owner → the lead, done)* All of 1–4.
  - **Prompt:** Russian names for roles and metrics are spelled out. «кого первым» is
    `get_top_nodes(5)` plus `get_node` on #1 only: 9.3 s live, down from 19–21 s, with all five
    rows listed, so «этих пятерых» still resolves. The dataset line is built from `analysis.stats`
    (`systemPrompt(stats)`). An off-topic question gets one line and the three demo questions.
  - **Rounding is in the tool results**, not only in the prompt: scores and ratios to 2 decimals,
    centralities to 3 significant digits.
  - **Mock:** an unrecognised question calls nothing and offers the three questions. «топ-N» is
    read, numbers have thousands separators, and the removal reply says whether seeds were cut off.
  - **English leftovers** in the registry and the loop are now Russian. `totalMatching` is 2 248.
  - **Also changed:** `find_collectors` defaults to 2 hops instead of 3. On the real data, 3 hops
    gave 581 shared receivers for the top five; 2 gives 194.
- *(16:30 — the agent owner → the lead, after `ac867a1`)* The pipeline was re-run on the analytics owner's calibrated rules and
  the outputs are committed. Roles: 1 798 peripheral, 219 terminal, 94 consolidator, 68 transit,
  53 distributor, 16 coordinator. The blockers hold: role_score is spread out, there are 0
  consolidators with pass-through ≥ 0.5 and 0 coordinators with outDeg < 3, and peripheral
  evidence names the threshold it missed. Three random gids each read in one sentence.
  **Change the demo's second question.** The top five are now mostly consolidators (money sinks),
  so «Кто собирает деньги с этих пятерых?» honestly finds one shared receiver, a peripheral, at any
  depth. **«Кто собирает деньги с топ-5 распределителей?»** finds 136. The first rows are two
  distributors, a coordinator and a consolidator, each fed by 4 of the 5. Both mock and live answer
  it: the mock reads the role from the question. Suggest swapping it into the chips
  (`widgets/assistant/model/suggestions.ts`), the README and the demo script. Also: the tab title
  is still «Agent Starter», and `why` still says «betweenness», which should be «посредничество»
  (the analytics owner, `priority.ts`).
- *(16:05 — the lead → the analytics owner, add to the blockers)* **`findCollectors` over-counts KZT**
  (`queries.ts`). The same incoming edges are summed once for every source that reaches the node.
  The mock shows `100000001330685100` collecting 4 637 878 KZT, but it received 2 435 923 in total.
  Count each edge once per collector.
- *(15:55 — the lead → the analytics owner, review of `1977adf`)* It builds cleanly and the traps hold: 0 truncated
  nodes are terminal, transit excludes seeds, and no seed is in the top 50. **Three blockers must be
  fixed by 16:45**, because the jury's three-gid defence fails on them:
  1. **`role_score` is 1.00 for almost every node** (`roles.ts:146,158,199`), because it is computed
     as value ÷ threshold and then clipped. Score how far past the threshold instead, for example
     `clamp((x − thr) / (k·thr))`. Then `why` stops starting with «сила роли 1,00».
  2. **The consolidator evidence contradicts itself** (`roles.ts:161`). `seedsUpstream` counts seeds
     at any distance (1 124 nodes have exactly 7), so «3 плательщика (12 seed)» is misleading. Write
     «из них N seed» from **direct** payers. Require `passThrough < 0.5` always: 13 consolidators
     forward more than they receive, for example `…7594394100` «отдаёт 854%».
  3. **The coordinator rule can't be defended** (`roles.ts:126-133`). 72 coordinators, 10 with
     `outDeg` 1. `…3299365100` has 1 payer and 1 recipient and passes on 100%: it is a transit, not
     an organiser. Require `outDeg ≥ 3` and count reach through different direct recipients. Aim
     for 10–20 coordinators.

  Should fix:
  - Terminal is too loose: 538 of 639 have a single payer. `inDeg ≥ 2 || inKzt ≥ 200 000` gives
    about 219.
  - A seed counts itself in `seedsUpstream` (`metrics.ts:164`).
  - Strong nodes fall to peripheral: `…8346837100` (9 payers, 25 recipients) and `…0332284100`
    (10 payers).
  - Evidence wording: «1 плательщиков», amounts without thousands separators, ₸ in evidence but
    KZT in `why`, and «мост 0.000» explains nothing.
  - `ANALYTICS.md` still says `boundary_censored` and "gate ≥ 0.60".

  **After the fixes, send the lead the final `ROLE_THRESHOLDS` and priority weights for the README
  (17:15).**
- *(16:00 — the agent owner → the analytics owner, three random gids after `1977adf`)* Two of three pass. The gap is in
  the one role the jury is most likely to draw: **peripheral** is 1 333 of 2 248 nodes, so random
  gids land there, and its evidence says only what the node has, not which rule it missed.
  `…8767925100`: «входящих 1, исходящих 0; поток 17144 ₸». The honest one-minute answer is "not
  terminal because 1 payer < 2 and 17 144 ₸ < 30 000 ₸", and the card should say so, for example
  «ниже порога терминала: 1 плательщик (нужно ≥ 2), 17 144 ₸ (нужно ≥ 30 000)». Isolated seeds
  read «входящих 0, исходящих 0; поток 0 ₸»: say «seed без переводов в выборке». The other two:
  `…4235471100` (truncated, peripheral) reads well; `…1282143100` (consolidator, «5 плательщиков
  (10 seed)», role_score 1.00) is blockers 1 and 2 above.
- *(14:22 — the analytics owner → the lead: freeze the product domain/schema and repo signatures in this plan; provide
  `edges.parquet`, `nodes.parquet`, `transactions.parquet`, and the dataset README. The analytics
  specification is ready in `src/server/aml/data/ANALYTICS.md`; implementation and calibrated
  thresholds are blocked until the files and contract exist. If Louvain/Parquet support needs a new
  package, add it in the lead-owned `package.json` or confirm the supplied starter implementation.)*
- *(15:25 — the lead → the analytics owner, answer)* **Done in `f02f221`.**
  - The domain is `graph`, not `aml`: the schema is `src/server/graph/model/graph.schema.ts`, and
    your stubs are in `src/server/graph/model/*.ts`, which are your files now.
  - The data is in `data/*.parquet`. hyparquet, its ZSTD compressors, graphology and Louvain are in
    `package.json`.
  - Move `ANALYTICS.md` to `src/server/graph/data/ANALYTICS.md` and delete `src/server/aml/`.
  - Keep to the method, with these adjustments:
    1. **Evidence, `why` and `hypothesis` are Russian** (the ТЗ's examples are Russian); rewrite the
       clauses.
    2. **The flag is `truncated`**, as in the schema, not `boundary_censored`.
    3. **MVP first, by 16:00:** roles, clusters, priority and evidence that pass the acceptance
       checks. Only then add the temporal extras (split, round amounts, burst). The stability and
       ablation studies go last, if there is time.
    4. **Check the role counts on the real data right away.** Gate ≥ 0.60 plus margin ≥ 0.05 could
       push almost everything into `peripheral`. The ТЗ says the data has clear candidates for
       every role (fan-in 8–24, fan-out 60–116, 72 pass-through nodes), and the screen must show
       them.
    5. The PageRank weight `log1p(sum_kzt)` is your call. The schema comment says `sumKzt`: tell me
       which, and I'll fix the comment.
    6. Input validation, the run summary and the SHA-256 hashes belong to the agent owner's reader and
       writer (`graph/repo`). Hand him the invariants list. Do not fail on "exactly 81 seeds":
       that is dataset-specific, so make it a warning.
    7. `topGids` is an array in the schema. the agent owner's CSV writer joins it with `|`.
