# Working in this repository

This is the rulebook for anyone working here, human or agent. **Codex and Claude Code both read
this file** — `CLAUDE.md` is a pointer to it — so that two agents editing the same repository at
speed are following one set of rules rather than two.

Read this before writing code. Then read the doc that covers what you are touching:

- `docs/architecture.md` — the two axes, the server tiers, transactions, migrations, testing
- `docs/design-system.md` — tokens, palette, type, space, motion
- `docs/ui-patterns.md` — which control a task gets, how forms and tables behave
- `docs/plan.md` — the scenario, the contract, and which lane you are in. Re-read it after every
  pull.

If the implementation conflicts with these documents, **stop and name the conflict** rather than
silently inventing behaviour.

---

## What this repository is

A starter, not a product. It contains an agent loop, a tool registry, a chat interface that shows
the agent's work, a component library and a design system. There is no domain: the only tool is a
clock, `get_current_time`, and it exists only so the wiring has something real to run.

**The product's tools go beside it in `TOOLS`**, and the scripted branch in `runMock` is rewritten
to drive the product's main scenario.

---

## The gate

```bash
pnpm check
```

One command, three tasks in parallel — typecheck, lint at `--max-warnings 0`, and the unit suite.
**Warnings are failures.** A change is not finished until this passes. Output is buffered per task
and printed in a fixed order, because three processes writing to one terminal interleave into
something nobody can read. `pnpm verify && pnpm test` still works and does the same thing serially.

Measured: about 6.1s parallel against 7.1s serial on a warm cache. Lint is roughly three quarters
of that and the processes contend for CPU, so parallelising is worth a second, not a revolution.

**The real lever is not running the whole gate every time.** While iterating, run the one spec that
covers what you are changing — `pnpm vitest run src/server/agent/usecase/tools.spec.ts` — and run
`pnpm check` once, at the end of a batch of related edits, before you commit. A vitest process
costs about 1.5s to start before it asserts anything, so the cost of a check is dominated by how
often you run it, not by how long it takes.

The database tests are `pnpm test:integration` and only matter if you turned the database on.

### Spend round trips, not caution

The full gate takes seconds. **The cost is round trips**, so cut those and never cut a check.

- Batch independent commands into one call. Read the set of files, not one at a time.
- Write files with the file tools. Editing source through a heredoc stacks two more layers of
  escaping on top of the language's own — and on Windows it will silently write CRLF and light up
  three hundred lint warnings.
- When the browser disagrees with the source, suspect the build. Stop the dev server, delete
  `.next`, start it again. Never delete `.next` while it is running.
- Verify CSS by computed style, not by screenshot. A screenshot of a stale stylesheet looks fine.

---

## What you learn goes in the repository, not in your memory

**Anything worth knowing tomorrow is written into a file and committed.** An agent's own memory —
Claude Code's `~/.claude` store, Codex's equivalent — is on one laptop, for one tool, for one
person. Three people and two different agents are working here. Knowledge that lives in a private
store is knowledge the other four participants do not have, and it is invisible to the technical
experts who read this repository afterwards.

So when you discover something durable, write it down here and commit it:

| What you learned | Where it goes |
| --- | --- |
| A rule about how we work | this file |
| A decision and why it was taken | `docs/decisions.md`, newest entry last |
| How the product is shaped | `docs/architecture.md` |
| Something a reviewer must know to run it | `README.md` |
| Something that will trip up the next change to a file | a comment in that file |

`docs/decisions.md` is the one to reach for when nothing else fits — a timed line saying what was
chosen and what it was chosen over is worth more at 17:00 than a perfect memory of the reasoning
that nobody else can read.

This is also a competition requirement in disguise: §5.4.8 wants a demonstrable hourly result, and
a written decision is a result.

---

## Architecture rules

1. The code has two axes. **Feature-Sliced Design for the interface** — `src/{app,views,widgets,
   features,entities,shared}`, importing strictly downward. **Tiered domain modules for the
   server** — `src/server/`, which is not an FSD layer.
2. Inside `src/server/` the tiers are `kernel`/`db` → `<domain>/model` → `<domain>/repo` →
   `<domain>/usecase` → `jobs`. Imports go only downward. A `repo` never imports another domain's
   `repo`; cross-domain work belongs in a `usecase`. A usecase lives in the domain of the data it
   primarily writes.
3. `src/pages/` must never be created: Next.js would treat it as the Pages Router. The FSD "pages"
   layer is `src/views/`, reached through the `@pages/*` alias.
4. Every file in `src/server/` starts with `import 'server-only'` — except `*.schema.ts`, which the
   interface is allowed to import and which may therefore depend on nothing but zod. No barrels in
   `src/server/`: deep imports only, because a barrel re-exporting siblings generates cycles.
5. The FSD layers never import Prisma, `src/server/*/repo` or `src/server/db`. `src/server/**` never
   imports React, Next, or anything from the FSD layers. Only `src/app/**` and `features/*/api` may
   import a usecase. Components never touch the database.
6. Domain operations are plain functions with the signature `(ctx, input)`. `ctx` is always first.
   `ctx.now` is injected; `createCtx()` in `src/server/kernel/ctx.ts` is the only place allowed to
   call `new Date()`.
7. Validate all external input on the server. **Tool arguments are external input** — they are a
   language model's free text. `defineTool` validates them for you; do not bypass it.
8. Never store a number that summarises a history — a remaining balance, a count, a derived expiry.
   Compute it from the rows. A stored summary is a future migration plus a backfill, and in the
   meantime a number that disagrees with the events beneath it.
9. Never expose provider tokens or database credentials to the browser. A provider's error message
   can carry an endpoint, a model name or part of a key: log it, never return it.
10. If the database is on: PostgreSQL is the source of truth, all access goes through
    `src/server/db`, all schema changes use migrations, and only a usecase opens a transaction. A
    repo always receives a `tx`. Never `Promise.all` inside one — a transaction holds one
    connection, so concurrent queries queue instead of parallelising.
11. Prefer simple relational models over premature abstraction. Avoid adding dependencies. Do not
    optimise for theoretical scale before the product works for one user.

Duplication in the interface is tolerated — extract to `widgets/` or `features/` only when a second
consumer genuinely exists. Duplication in `src/server/` is not: two implementations of the same
rule means two different answers to the same question.

### Stack

Next.js (App Router) + React + TypeScript · Tailwind · Radix UI primitives · Heroicons · Zod ·
the OpenAI SDK · graphology + Sigma.js · hyparquet · Server Actions for authenticated mutations, Route
Handlers for webhooks and external APIs.

Do not introduce a second backend framework, microservices, GraphQL, Kubernetes, Redis, Kafka, a
monorepo, a vector database or a separate frontend application. Do not use shadcn/ui or any kit
that copies component source into the repository — build on Radix with Tailwind classes.

**`tsconfig.json`, `eslint.config.js` and `.prettierrc` are owned by the repository owner.** Do not
create, overwrite or "fix" them. If a config file is missing, say so and stop.

---

## Design rules

Follow `docs/design-system.md` and `docs/ui-patterns.md`. The ones that are easy to break:

- Semantic tokens only (`bg-surface`, `text-fg-muted`, `bg-accent`). Never a raw palette value,
  never a hard-coded colour.
- The dark theme is defined once, in `src/app/globals.css`. No component contains a dark-mode
  colour. Every colour has its light definition on bare `:root`.
- No web fonts from a foreign CDN. Fonts come through `next/font`.
- Prefer a border to a shadow in the light theme.
- Every list surface ships loading, empty and error states, and the skeleton matches the real
  layout including its width.
- Status is never colour alone.
- No raw `<input>`, `<select>` or `<textarea>` in the screen layers — every control comes from
  `src/shared/ui/`, and a test enforces it.
- Nothing writes on `change`. A control edits a draft; a button writes it.
- A form is never a modal. A modal is for confirming something that takes away.

---

## Agent rules

These are about the product being an agent, and they are the ones a reviewer will try to break.

1. **Never claim an action happened unless a tool returned a result saying so.** Enforce it in the
   prompt *and* in the code. A rule that exists only in the prompt is a rule the model can talk
   itself out of.
2. **Never call a destructive tool without an explicit confirmation in a separate user message.**
   Showing what you are about to do is not confirmation.
3. **A tool handler re-checks its own preconditions.** The model is not the authority on whether an
   action is allowed; the rules are. A refusal is a successful tool call reporting a refusal.
4. **`executeTool` never throws.** A throw kills the turn and blanks the activity panel — the one
   thing an audience is looking at. A failing tool is a row that says "failed".
5. **Keep `LLM_PROVIDER=mock` working.** It is how the product is demonstrated with no network, and
   how a reviewer verifies it without being handed a key. When you change the tools, update the
   scripted branches. It runs the real dispatcher, so it stays honest by construction.
6. **The activity panel shows what the server reported it did**, never what the interface guessed it
   would do.

Adding a tool is one object in `TOOLS` — see the README. The JSON Schema is derived from the zod
schema; never write it twice.

---

## Definition of done

Not when the screen looks correct. When:

- the behaviour is correct and validated on the server,
- loading, error and empty states exist,
- important edge cases are covered by tests,
- typecheck, lint and tests pass,
- **any rule, check or hook the change adds has been watched failing.** Break it on purpose first,
  then fix it back. A check that was never seen failing is a check that tests nothing.

When fixing a bug, first reproduce it and identify the violated invariant. Do not patch symptoms
with UI-only state.

---

# Competition rules — HackAlem AI, 23 September 2026

**The numbered items come from the rules, and most carry disqualification. Read them before the
first commit.**
Source: the official Положение. Where this summary and that document disagree, the document wins.

### The shape of the day

Check-in 09:00–12:00 · opening 12:00–13:00 · **competitive part 13:00–18:00** · submission fixed at
18:00. Judging 24–28 Sept, Demo Day 29 Sept, awards 1 Oct at Digital Bridge.

**Five hours.** Everything that does not serve one demonstrable scenario is out of scope.

### Non-negotiable

1. **Have a verifiable intermediate result at the end of every hour** (§5.4.8). A missing one is
   listed as grounds for disqualification (§5.9.2). Code, a prototype, a design, an architecture
   diagram, tests or prepared data all count. The rules do not say how it is shown; our practice
   is to commit and push real progress before every hour mark, because the repository is the
   evidence nobody has to take on trust.
2. **All main development happens in the GitHub repository the organiser creates** via
   edu.astanahub.com (§5.4.9, §5.4.11). Developing in a private repository and transferring the
   result is grounds for disqualification.
3. **This starter is a pre-existing template and must be disclosed as one** (§5.4.4, §5.4.4.2). It
   is permitted precisely because it contains no task functionality. The disclosure section in the
   README is not optional.
4. **The product functionality itself must be built during the competitive part** (§5.4.5). Do not
   bring or reuse a previously built solution to the task. If the task resembles something you have
   already built, write it again rather than pasting it.
5. **The README must let a stranger run it** (§5.4.15). Description, architecture, technologies,
   install, run, dependencies, environment variables, and how to check the main scenario. **If the
   experts cannot run it from the README, the project is eliminated and no corrections are
   accepted** (§5.4.16, §5.6.5). Keep the README true as you go; do not leave it to 17:50.
6. **The main scenario must be verifiable without your personal accounts, subscriptions or keys**
   (§5.6.6). This is what `LLM_PROVIDER=mock` is for. If a live key is needed for the full
   experience, provide a demo credential or a test account.
7. **Every participant stays on site** from check-in to the end (§5.1.7). Absence beyond 60 minutes
   without permission is grounds for disqualification.
8. **Disclose every third-party component** — open source, models, datasets, templates (§5.4.4).

**Our practice, not a rule: every member commits their own lane under their own git identity.**
The rules require no particular authorship, but the organiser may check each participant's actual
contribution (§5.4.7) and the jury may ask about it (§4.6). Distinct commit authors are the easiest
evidence of that; the other evidence is each person being able to explain and demonstrate their own
work. Pair work takes a `Co-authored-by:` trailer. That an agent wrote the code changes nothing —
§5.4.12 allows any AI tool; the question is who directed the work.

Any AI tool is allowed (§5.4.12); **Codex is not mandatory** despite what the landing page says —
*unless the technical specification of your specific task requires it*. Read your task's ТЗ at
12:00 and check.

The technical evaluation criteria come from your task's own ТЗ (§5.5), published before the start.
Read it before designing anything.

### What Demo Day actually scores (§5.7.2, 100 points)

| Criterion | Points |
| --- | --- |
| Value — does it solve a real, comprehensible problem | 25 |
| Result and quality — does the prototype actually deliver the scenario | 20 |
| Potential to scale | 20 |
| Presentation, demo and answers | 20 |
| Innovation | 15 |

Note what is absent: the jury explicitly does **not** re-examine the code. Clean architecture buys
you speed and a pass through technical selection — it earns no points on the day. **Do not
gold-plate.** Spend the time on the scenario and the demo.

The activity panel is worth real points under Presentation: it makes "agentic" visible in a way a
chat bubble cannot.

---

## Working in parallel

Two agents and three people in one repository for five hours collide unless paths have owners.
Fill this in at 13:00 and keep to it. One owner per path; if you need a file you do not own, say so
rather than editing it.

| Path | Owner | Why |
| --- | --- | --- |
| `src/server/<domain>/model/*.schema.ts` | **the lead, first, then frozen** | It is the contract the other two build against, so it is written once, before anything else starts. |
| `src/server/<domain>/usecase/tools.ts` | the agent owner | Tool design is the heart of an agent. |
| `src/server/<domain>/usecase/agent.ts`, `prompt.ts` | the agent owner | Prompt rules and the loop belong with the tools they bind. |
| `src/app/api/**` | the agent owner | The route is a thin shell over the usecase the same person owns. |
| `src/server/<domain>/data/*.json` | the analytics owner | Fixtures are the shape of the problem; getting them right is analysis, not typing. |
| `src/server/<domain>/repo/*.ts` | the analytics owner | Pure synchronous functions with fixed signatures and unit tests. No React, no Next, no framework knowledge needed. |
| the algorithmic core, if the task has one | the analytics owner | Scheduling, matching, ranking, routing, graphs or DP go to the person who owns the algorithm. |
| `src/views/**`, `src/app/page.tsx` | the lead | The interface is the lead's lane. |
| `README.md`, the demo script | the lead | It is an elimination gate (§5.4.15) and it needs one voice. |

**The lead also drives the agents**, so orchestration, prompt writing and merging agent output sit
in one place rather than being done three ways at once.

The schema file is the contract. Write it first, then everyone works against it in parallel. If it
has to change, change it once, in one place, and say so — two people quietly adapting to each
other's drift is how an hour disappears.

### Every plan is split into lanes

Three people, three laptops, an agent on each. The agents share nothing but this repository, so
**the plan lives in `docs/plan.md`**, and every agent reads it before starting work and again after
every pull. It is written once at 13:00 by the lead's agent from the task's ТЗ, and changed only by
the lead.

When you are asked to design the architecture or make a plan, write it into `docs/plan.md` in the
shape that file already has, and hold it to these rules:

1. **One lane per person**, taken from the ownership table above. A lane lists the paths it owns,
   its tasks in order, what it depends on, and what "done" looks like.
2. **No path appears in two lanes.** If two lanes need the same file, the plan is wrong — split
   the file or give it one owner and make the other lane a request.
3. **The contract comes first and is small.** The schema, the tool names with their arguments and
   return shapes, and the repo function signatures. It is frozen by 13:30.
4. **Every lane can start immediately.** Anything a lane depends on that does not exist yet gets a
   stub with the real signature — a repo function returning fixture data, a tool returning a
   hard-coded result, a screen rendering the schema's example. Nobody waits on anybody.
5. **Integration points are named**: which lane's output meets which lane's input, in which file,
   and by what hour.
6. **Each lane has something committable every hour** (§5.4.8). The checkpoint table in the plan
   says what.
7. **Features are cut across lanes, not within them.** A feature that needs all three lanes is
   three tasks, one per lane, against the same contract — not one task that one person carries
   through three layers.

When you are working inside a lane, you work only in that lane's paths. If you need a change in a
path you do not own, add a line under **Requests** in `docs/plan.md` and tell your person; do not
make the edit.

### Git, with three people and several agents

- **Everyone commits to `main`.** No feature branches between people: paths are disjoint, and a
  branch is merge time five hours do not have.
- **`git pull --rebase` before every push. Push at least every thirty minutes**, small commits.
  A push that waits two hours is a conflict that waits two hours.
- **Stage your own paths by name** — `git add src/server/<domain>/repo` — not `git add -A`, which
  sweeps up whatever another agent on the same laptop left half-written.
- **Agents do not push, force-push, rebase or amend.** The person does, so every commit carries a
  person's identity and nobody's history is rewritten under them.
- **A conflict in a path you do not own: take theirs.** In your own path: keep yours and re-run
  `pnpm check`.
- **`package.json` and `pnpm-lock.yaml` belong to the lead.** A lockfile conflict is unreadable.
  Need a dependency — ask; do not add it.
- **Pull before you start a task, and have your agent re-read `docs/plan.md` after the pull.**

### More than one agent on one laptop

Two agents in one working copy see each other's half-written files, fail each other's gate and
commit each other's changes. A second agent gets **its own worktree**, on a path set of its own
from the plan:

```bash
git worktree add ../hack-<task> -b <task>      # beside the project, never inside it
cd ../hack-<task>
cp ../project/.env .env
pnpm install                                   # fast: pnpm links from its store
pnpm dev -p 3001                               # a port of its own
```

When the task is done, merge it back from the main working copy and push from there:
`git merge <task>`, then `git worktree remove ../hack-<task>`. Claude Code subagents started with
`isolation: "worktree"` do the same thing automatically.

Two agents per laptop is the useful ceiling. Past that, the person spends the day reviewing and
merging instead of directing.

**Give the least familiar stack the most bounded tier.** A repo function with a frozen signature and
a spec is the safest thing to hand anybody working in an unfamiliar stack under time pressure. Write
those signatures into `contracts`-style types or the schema before 13:30 so that lane is never
blocked on someone else's file.

---

## Language

**Prompt your agents in whatever language you think fastest in.** Russian is fine — Claude and
Codex both follow Russian instructions without measurable loss, and most of the technical nouns are
English loanwords anyway. Do not translate your thinking into English before prompting; that is
wasted time and it loses nuance.

**The repository stays in English.** Code, identifiers, comments, commit messages, these docs. Not
because English is better, but because a codebase that is half Russian and half English is one an
agent follows inconsistently — it will mirror whatever language the surrounding lines are in, and
you end up with mixed-language identifiers and comments that read like two different projects. One
language in the files, any language in the chat.

Two exceptions worth making deliberately:

- **The README may open with a short Russian summary** above the English body. The technical
  experts are Kazakhstani; a five-line Russian abstract costs nothing and removes any chance that
  the person deciding whether your project runs is reading a second language while doing it.
- **The product's own interface language is a product decision, not a code-style one.** The demo is
  to a jury in Astana. Russian or Kazakh user-facing copy will very likely land better than
  English. The Cyrillic font subset is already configured in `src/app/layout.tsx`, so this costs
  nothing but deciding — decide it at 13:00 and be consistent.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
