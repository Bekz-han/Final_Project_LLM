# Kickoff runbook — 23 September 2026

Five hours, 13:00–18:00. This file exists so that none of them are spent deciding things that
could have been decided the night before.

Rules that carry disqualification are in `AGENTS.md` under **Competition rules**. This is the
sequence.

---

## Every hour, on the hour

**Commit and push something real.** The rule is a verifiable result for every hour, and a missing
one is grounds for disqualification; a pushed commit is the proof that needs no explaining. Code, a
prototype, a schema, an architecture note, tests or prepared data all count — it just has to be in
the repository.

Suggested shape of the five hours:

| | |
| --- | --- |
| 13:00–14:00 | Schema frozen. Tools stubbed with real names and real signatures. |
| 14:00–15:00 | Repo and tool handlers working against real fixture data. Tested. |
| 15:00–16:00 | Prompt, agent loop running end to end against a live model. The scenario works once. |
| 16:00–17:00 | The interface: copy, empty and error states, the activity panel showing real calls. |
| 17:00–17:30 | **README freeze.** Someone who did not write it follows it from a clean clone. |
| 17:30–18:00 | Rehearse the demo twice. Commit. Stop touching the code. |

## 17:00 — the README is the elimination gate

If the technical experts cannot run the project from the README, it is eliminated and no
clarifications are accepted. Treat this as the highest-risk item of the day, because it is the one
that fails silently.

- [ ] A teammate clones into a **fresh directory** and follows the README literally, no shortcuts.
- [ ] It covers: what it does, the architecture, the technologies, install, run, dependencies,
      environment variables, and how to check the main scenario.
- [ ] `.env.example` is current and copying it is enough to start.
- [ ] The main scenario runs **without any of your personal keys** — `LLM_PROVIDER=mock`. If the
      full experience needs a live key, supply a demo credential.
- [ ] The third-party disclosure section is present and names this starter.
- [ ] `git shortlog -sne --all` shows all three names with sane commit counts. **Keep the
      `--all`**: without a revision argument it reads from standard input and, run from a script or
      an agent, silently prints nothing.

## 18:00

Whatever is in the repository at 18:00 is the submission. Changes after that are not evaluated.

---

## When something breaks

| Symptom | Do this |
| --- | --- |
| Rate limits, 429s | Already retried automatically. If it persists, switch `LLM_PROVIDER=chat` to NVIDIA or Groq. |
| Credits exhausted | `LLM_PROVIDER=chat` with the NVIDIA endpoint. |
| No network at all | `LLM_PROVIDER=mock`. Update the scripted branches to match your tools — it calls the real dispatcher, so it stays honest. |
| Model ignores a tool | Rewrite the tool `description` for *when to use it*, not what it returns. That is usually the whole fix. |
| Browser disagrees with the source | Stop the dev server, delete `.next`, restart. Never delete it while running. |
| Lint explodes with `␍` warnings | Something wrote CRLF. `pnpm format`. Use the file tools, not shell heredocs. |
| The build works but the page is unstyled | `pnpm test` — `globals.spec.ts` catches Tailwind emitting an empty stylesheet. |
| A commit went in under the wrong identity | `git commit --amend --author="Name <email>"` on the last one, if unpushed. Never rewrite pushed history (§5.4.11). |

## The demo itself

Ninety seconds. One person types one sentence. The agent picks its own tools, the panel fills with
real calls, and it finishes with a concrete result.

Show a refusal if you have time — an agent that declines to do something it is not allowed to do is
a far stronger argument for the engineering than one that always says yes.
