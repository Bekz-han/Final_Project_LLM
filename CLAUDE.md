# Claude Code instructions

**Read `AGENTS.md`. It is the rulebook for this repository and it is canonical.**

There is deliberately nothing here that is not there. Codex and Claude Code both work in this
repository, and two agents following two rulebooks at speed is how a five-hour build ends with an
architecture nobody recognises. One file, both agents.

`AGENTS.md` covers: the gate, the two axes and the server tiers, the design rules, the agent rules,
the definition of done, the competition rules that carry disqualification, and the file-ownership
map for working in parallel.

The specifications it refers to:

- `docs/architecture.md`
- `docs/design-system.md`
- `docs/ui-patterns.md`

`README.md` is written for someone who has never seen the repository — including the technical
experts who must be able to run it. Keep it true.

---

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your
training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's
directory; in monorepos the `next` package may not be visible from the repo root) before writing
any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at
`node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates
the uncommitted change; committing it with your work keeps the tree clean.
