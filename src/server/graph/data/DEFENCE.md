# Three-gid defence notes

These rows were selected during the random-gid review recorded in `docs/plan.md`. Each answer
states the applied rule, the numeric evidence and the observation limit without implying guilt.

## `100000008767925100` — peripheral

- Observed: depth 1, one payer, no recipients, KZT 17,144 received, not truncated.
- Rule: it misses both terminal alternatives: `inDeg` is 1 rather than at least 2, and `inKzt` is
  KZT 17,144 rather than at least KZT 200,000.
- One-sentence answer: «Роль peripheral: исходящих переводов нет, но для terminal недостаточно
  признаков — один плательщик при пороге два и 17 144 KZT при пороге 200 000 KZT».

## `100000004235471100` — peripheral, truncated

- Observed: depth 4, one payer, no observed recipients, KZT 180,000 received, reachable from seven
  seeds.
- Rule: a depth-4 sink is never terminal because the crawl stopped there; one payer also does not
  meet the consolidator input rule.
- One-sentence answer: «Роль peripheral с флагом truncated: узел найден на четвёртом колене, поэтому
  отсутствие исходящих переводов означает границу наблюдения, а не доказанную остановку денег».

## `100000001282143100` — consolidator

- Observed: depth 3, five payers, KZT 1,700,000 received, no observed outflow, `passThrough = 0`,
  reachable from ten seeds and not truncated.
- Rule: `inDeg >= 5` and `passThrough < 0.5`; direct seed payers are zero, but they are not required
  once the five-payer gate is met.
- One-sentence answer: «Признаки consolidator: пять плательщиков обеспечили 1 700 000 KZT, а дальше
  в наблюдаемом графе ушло 0%; это гипотеза консолидации, не вывод о виновности».

## Answers to likely follow-ups

- `roleScore` is rule strength, not a probability of crime.
- `seedsUpstream` counts reachable seeds; evidence reports direct seed payers separately.
- Missing activity may be outside the bank, below KZT 5,000, outside July 2026 or beyond hop four.
