# Demo script — 5 minutes

Owner: the lead. Rehearse twice before 18:00. The ТЗ asks for "5 minutes: a live run and a
substantive walk-through of 2–3 nodes", and the defence is "the jury names 3 random gids; the team
explains each role in a minute from its own metrics". This script serves both.

Speaker lines are in Russian because they are spoken in Russian. **Never read a gid from this file.**
The nodes are picked by rule at 17:30 from the final `output/`, because hard-coding gids is
forbidden by the ТЗ and the numbers change until the analytics owner's thresholds are final.

---

## Before the demo (17:30, once)

1. `git pull`, then `pnpm install`, then `pnpm pipeline`. Check that the role counts it prints are
   not all `peripheral`.
2. Pick the three demo nodes **by rule** and write their gids on a sticky note, not in the repo:

   | Slot | Rule | How to find it |
   | --- | --- | --- |
   | A — consolidator | highest-priority non-seed `consolidator` with `seeds_upstream` ≥ 2 | `top_nodes.csv`, first row with role `consolidator` |
   | B — distributor | the `distributor` with the largest `out_deg` | sort `nodes_roles.csv` by `out_deg` |
   | C — truncated | a node with the flag `truncated` and `in_deg` ≥ 3 | filter `flags` contains `truncated` |

3. `pnpm dev`, open <http://localhost:3000>, and **reload once**: hot reload leaves sigma confused.
4. Mock or live? Live (`LLM_PROVIDER=responses`, `gpt-6-luna`) if the venue wifi works. Otherwise
   `mock`, which calls the same tools. Decide at 17:45 and do not switch during the demo.
5. Have a terminal with the repo open, font large enough to read from the back row.

## The five minutes

**0:00–0:30 — The problem.** Screen: the title slide or `docs/solution.svg`.

> «Банк знает 81 клиента из дела о наркотиках — это нижний уровень. Кто собирает деньги, через кого
> их гонят и кто ими распоряжается — аналитик восстанавливает вручную, часами на один узел. Мы
> отвечаем на один вопрос: кого из 2 248 клиентов сети проверять первым и почему.»

**0:30–1:00 — A live run.** Terminal: `pnpm pipeline`.

> «Один запуск от сырых parquet до трёх выгрузок — за несколько секунд, лимит ТЗ — пять минут.
> Пайплайн сам проверяет результат: 2 248 строк, топ не меньше 20, в каждом обосновании есть числа.
> И он честно печатает особенности данных: 444 узла на 4-м колене мы никогда не называем конечными
> получателями — обход там закончился, а не деньги.»

**1:00–1:40 — The network.** Browser.

> «Это вся сеть. Стрелка — направление перевода, цвет — роль, размер — приоритет проверки.
> Переключаю на кластеры — сообщества, связанные деньгами; у каждого есть гипотеза о назначении.»

Toggle role → cluster → role. Point at the legend.

**1:40–3:00 — Node A and node B.** Open the Топ-лист and click node A.

> «Первый в списке. Роль — точка консолидации. Почему: [читаем evidence с экрана — число
> плательщиков, сколько seed выше по потоку, какую долю он отдаёт дальше]. Вот его крупнейшие
> отправители. Это гипотеза для проверки, не вывод о виновности.»

Click the largest sender on the card to show navigation. Search node B by gid.

> «Распределитель: рассылает на [out_deg] получателей. Так выглядит веер.»

**3:00–4:15 — The assistant.** Open the «Ассистент» tab. Click the chip «Кого проверять первым и
почему?».

> «Ассистент не придумывает — он вызывает инструменты над графом, и каждый вызов виден в панели.»

Point at the activity panel rows. Click a gid in the answer: the graph flies to it. Then ask «Кто
собирает деньги с этих пятерых?», or «Что будет, если убрать топ-5?» if `simulate_removal` works:

> «Если заблокировать эти пять узлов, сеть распадается на N фрагментов — вот куда бить.»

**4:15–5:00 — Node C and the honesty close.** Search node C.

> «А этот узел мы специально не называем конечным получателем: он на 4-м колене, исходящие
> переводы за пределами выгрузки. Инструмент говорит, чего не знает, и какой запрос сделать
> дальше. Всё работает локально, без ключа — в режиме mock жюри проверит сценарий само. Спасибо.»

## The jury's 3 random gids

For each gid: search it and open the card, then answer in this order, reading from the card:

1. **The role and its rule.** «Роль X, потому что правило: [порог из README → Method]».
2. **The numbers that cleared it.** The evidence line, then the metrics under it.
3. **The confidence.** `role_score` shows how far the node cleared the threshold, and the flags.
4. **What we do not know.** The truncation or the seed inflow, if either applies.

If the role looks wrong, say so and name the threshold that decided it. A defended rule scores
better than a denied one.

## If something breaks

| Symptom | Do this |
| --- | --- |
| The graph is blank | Reload the page. If still blank, the tables and card work without WebGL; demo from them. |
| The live model is slow or errors | Set `LLM_PROVIDER=mock` in `.env` and restart `pnpm dev`, which takes ~10 s. |
| All roles are `peripheral` | You are on stale `output/`: run `pnpm pipeline`. |
| The laptop dies | A teammate's laptop: `git pull`, `pnpm install`, `pnpm dev`. |
