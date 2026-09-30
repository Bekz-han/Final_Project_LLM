# Evaluation set

`eval_set.jsonl` is the fixed evaluation set for the course project: 40 questions, frozen before
the first measurement. Every ladder step is measured on exactly this file. The notebook checks its
fingerprint before each run, and `pnpm eval:build` refuses to overwrite it.

Built by `scripts/build-eval-set.ts` from `output/analysis.json` (its SHA-256 is recorded in
`eval_set.meta.json`), through the same tools the agent calls. So every reference is something a
correct agent could have read, and none is typed by hand. Nodes are picked with a seeded generator
(seed 42), so a rebuild on the same analysis is byte-identical.

## One item

| Field | Meaning |
| --- | --- |
| `id` | `q01` … `q40` |
| `input` | the analyst's question, as typed |
| `expected` | a readable reference, or `отказ` when the right answer is to decline |
| `kind` | `типовой` (typical), `пограничный` (borderline phrasing or data limits), `отказ` (must decline) |
| `topic` | what the question exercises, for the error breakdown |
| `check` | what the rule scorer tests, below |

## `check`

| Key | Passes when |
| --- | --- |
| `gidsAll` | every listed gid appears in the answer as a full digit string |
| `gidsAny` | at least one listed gid appears |
| `role` | the Russian name of the role appears (matched by stem) |
| `numbers` | each `value` appears within `tol`; amounts carry a 0.5 % tolerance so «1,5 млн» counts |
| `mentionsAny` | at least one listed substring appears (lowercase) |
| `refusal` | the answer declines and names no gid outside `allowedGids`: nothing invented |

The rule scorer and the LLM judge live in the notebook; see `notebooks/`.
