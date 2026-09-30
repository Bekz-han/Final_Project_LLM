# Interface Patterns

`docs/design-system.md` decides **what the product looks like** — tokens, palette, type,
motion, density numbers. This document decides **how a screen is assembled**: which control a
task gets, where a form lives, what a table row does, what every input field must declare.

It exists because the first six screens were built one at a time, and each one invented its own
answers. The class string for a `<select>` was written out four times in four files, with three
different heights. A numeric field accepted letters. One screen put its add-form behind
a button and the next left it open forever. None of that was a decision; it was the absence of
one, repeated. A rule written down once is cheaper than the same argument at every screen.

**When this document and a screen disagree, the screen is wrong.**

---

## 1. What this rests on

The rules below are not taste. Each one comes from something measured, and the reasoning is kept
here so that a future change can argue with the reason rather than with the rule.

**Modals hide the data people are editing against.** Nielsen Norman Group observes in testing
that users look at neighbouring records while they edit one — to recognise the right format
rather than recall it. A modal covers exactly those rows. The same research says editing in place
works only when the table is narrow, and that the row must visibly change into an edit state or
people edit by accident.
→ [Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/)

**A modal is for stopping somebody, not for holding a form.** The decision tree is: does the task
need undivided attention, or does it need the context behind it? Modals are for short,
self-contained, high-stakes moments — a destructive confirmation — and explicitly not for
multi-step work, error messages, or anything the user needs to compare against.
→ [Modal vs. Separate Page: UX Decision Tree](https://www.smashingmagazine.com/2026/03/modal-separate-page-ux-decision-tree/)

**A single column is measurably faster to fill.** Two independent tests: 702 desktop
participants completed a one-column form in 102.3s against 117.8s for the same fields in two
columns — 13% slower — and a second study found the same 15-second gap. Two columns break the
top-to-bottom path, so people fill fields out of order and trip the validation.
→ [Speero](https://speero.com/post/form-field-usability-should-you-use-single-or-multi-column-forms-original-research),
[HubSpot](https://blog.hubspot.com/marketing/one-vs-two-column-form-conversion-test)

**Dense is the direction, but one fixed density is a guess.** The 2026 pattern is "quiet chrome,
high density": less border and shadow, more rows on screen. The same sources warn that shipping a
single row height assumes which user you have. We answer that in §7.
→ [7 SaaS UI Design Trends for 2026](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)

**A pointer target is at least 24×24 CSS pixels.** WCAG 2.2 Level AA, SC 2.5.8. This is the floor
under every density and size decision here.
→ [Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

---

## 2. Three kinds of screen

Every screen in this product is one of three. A new screen that seems to be a fourth kind is
worth a conversation before it is worth code.

**A list.** A page title, an action to add, a search or filter row, then a table. The table is the
screen; everything else serves it.

**A record.** A header with the name and the one status that matters, then cards. From `xl` up it
is two columns: the record on the left (its fields, the people attached to it), what happened to
it on the right (history, the account it signs in with). Below `xl` the same cards in the same
order, one column.

**A settings surface.** Named cards, each owning one list or one group of rules. Two cards may sit
side by side from `xl` when both are short.

---

## 3. Which control a task gets

| The task | The answer | Why |
|---|---|---|
| One or two short fields in a table row | Edit in place, opened by «Изменить» | The settings tables are narrow — NN/g's condition — and the row visibly changes |
| A record with several sections | Its own page | Needs attention, and there is too much of it for a panel |
| Confirming something that takes access, a relationship, or a record away | Modal (`ConfirmButton`) | The one case where blocking the screen is the point |
| Adding anything | A form that opens in place, under «Добавить» | Progressive disclosure without losing the page behind it |
| Quick look at a record without leaving the list | Drawer — **deferred**, see §10 | |

**No form is ever a modal.** Not creating a record, not inviting a user, not editing a setting.
If a form feels like it needs a modal, it needs a page.

**A row in edit mode shows only its own controls.** Its other actions — archive, history,
suspend — disappear while it is open, and come back on save or cancel. Two sets of buttons
competing in one row is how somebody archives a record they were renaming.

**Nothing writes on `change`.** A select, a checkbox or a text field edits a draft; a button
writes it. This rule was bought the hard way: a role select applied on change, and one mis-click
demoted an owner with no confirmation and no way back. The only controls that may act
immediately are the ones that change nothing on the server — a filter, a search box, a
collapse toggle.

---

## 4. Forms

1. **One column.** Fields stack. This is the default and it does not need a reason.
2. **Two columns only for genuinely paired short fields** — Фамилия/Имя, «Индивидуально, мин» /
   «Группа, мин». Never for a whole form.
3. **A field is at most `max-w-xl` wide**, whatever the container does. A text input stretched to
   1600px is harder to fill, not easier.
4. **A form card is at most `max-w-3xl`.** Tables take the width; forms take a measure.
5. **Every field is a `<Field>`** — label, control and message are one component because they
   have to agree: `htmlFor`, `aria-describedby` and `aria-invalid` are set together or one of
   them is always missing.
6. **Validation is the server's schema.** The form resolves against the same `*.schema.ts` the
   usecase parses, so what the browser refuses and what the server refuses cannot drift.
7. **The error goes under the field it is about.** A message above the form is for what has no
   field — a conflict, a missing row, a dead session.
8. **The submit button says what it does** — «Добавить ученика», not «ОК» — and says it is
   working — «Сохраняем…» — while it is.

---

## 5. Fields: what every input must declare

A numeric box accepted letters because nobody decided what kind of box it was. Each
kind is decided here, once.

| Kind | Component | Declares |
|---|---|---|
| Name, title, label | `Input` | `maxLength` equal to the schema's, `autoComplete="off"` |
| Phone | `Input` | `type="tel"`, `inputMode="tel"`, `maxLength={40}`, `autoComplete="off"` |
| Email of a person in a record | `Input` | `type="email"`, `inputMode="email"`, `autoComplete="off"` |
| A whole number — age, minutes, count | `NumberInput` | Digits only, `inputMode="numeric"`, `min`/`max` |
| Date | `Input type="date"` | A `max` that rules out a typo of a century |
| Free text — notes | `Textarea` | `maxLength` equal to the schema's |
| A closed list | `Select` | `size="sm"` in a table row, default on a card |
| Yes/no | `Checkbox` | A label that is clickable |
| One of three or four | `SegmentedControl` | |

**`autoComplete` is off by default, and that is a decision, not laziness.** Every field on these
screens holds somebody else's data — another person's phone, another person's email. A browser
offering the operator's own details there is one Tab away from filing the wrong number under the
wrong record. Real autocomplete tokens (`email`, `current-password`, `one-time-code`) belong only
on the screens where the field is the signed-in person's own: sign-in, password reset, one-time
codes.

**A numeric field refuses letters rather than complaining about them.** `type="number"` is not
enough: browsers accept `e`, `+` and `-` in it, and its spinner and scroll-wheel behaviour are a
nuisance in a table. `NumberInput` keeps a text input with `inputMode="numeric"` and drops
anything that is not a digit as it is typed.

**No raw `<input>`, `<select>` or `<textarea>` in `src/views/**`.** A static test enforces it —
see §9. Every control comes from `src/shared/ui/`, so a change to the way fields look is one
edit and not a search-and-replace across seven screens.

---

## 6. Tables

1. **The first column is the human-readable identifier** — the person's name, the programme's
   name. Not an id, not a date.
2. **Rows answer the pointer.** A hover ground on the whole row is what keeps the eye on the line
   while it travels to the right-hand columns.
3. **The header sticks** when the table is longer than the screen.
4. **Row actions stay visible as buttons** while there are at most three per row. A menu costs a
   click on every use to save space a wide screen is not short of. When a row needs a fourth and
   a fifth action, this rule gets revisited, not quietly broken.
5. **Status is a `Badge` and never colour alone** — the word carries it (`docs/design-system.md` §9).
6. **An empty table says what to do next**, not "no data".
7. **Batch actions and checkboxes are not built** until a job needs them.

---

## 7. Density

Density is how much air a row has: a 40px row is comfortable, a 32px row fits a third more on
screen. The industry argument is whether to ship a toggle between them, because a tool with two
thousand rows and a tool with twenty want different answers.

**Ship one density first: 40px rows, 36px controls, 32px small buttons.** Until a list regularly
runs past two screens, a toggle is a preference nobody has. `docs/design-system.md` §7
describes the compact mode; it is the target, not a promise for today.

**Revisit when** a single list regularly runs past two screens.

---

## 8. The component vocabulary

Everything a screen needs already exists or is named here. A screen that needs something else
adds it to `src/shared/ui/` and to this list, and does not style it locally.

**Built:** `Button` (primary, secondary, ghost, danger), `Input`, `NumberInput`, `Select`,
`Textarea`, `Checkbox`, `SegmentedControl`, `Field`, `Card`, `Table` + `TableHead`/`Th`/`Tr`/`Td`,
`Badge`, `Avatar`, `Callout`, `ConfirmDialog`, `ConfirmButton`, `Toast` + `useToast`,
`HistoryPanel`, `ChangeHistory`, `ThemeToggle`.

All of them share `src/shared/ui/control.ts` for the parts a form control has in common — the
border, the ground, hover, disabled, invalid. Height and text size stay with the component,
because a select in a table row is 32px and the same select on a card is 36px.

**Named and still missing:** `Skeleton`, `EmptyState`, `ErrorState`, `Tooltip`, `Kbd`, `Menu`,
`Drawer`, `Pagination`. Until `Skeleton` exists, each `loading.tsx` draws its own — and copies
the layout of the screen it stands in for, including its width.

**Three states ship with every list surface** (`docs/design-system.md` §10.2): loading as a skeleton that
matches the real layout — including its width — empty with the action that fills it, and error
with a way to retry.

---

## 9. How this stays true

Rules that nothing checks are rules that quietly stop being true. Two checks carry this document:

- `src/shared/ui/rawControls.spec.ts` reads the screen layers and fails on a raw `<input>`,
  `<select>` or `<textarea>`.
- `src/shared/ui/NumberInput/digits.spec.ts` holds the rule that keeps letters out of a numeric
  field, including `1e5` — a valid value for `type="number"`, which is why nothing here uses one.
- The design-token rule in ESLint fails on a hard-coded colour.
- `src/app/globals.spec.ts` builds the stylesheet and asserts it is not empty, because Tailwind's
  source detection has failed silently in this project and served unstyled HTML with a clean log.

Each was watched failing before it was trusted. Do the same with the next one.

---

## 10. Deferred, with the trigger to revisit

**Drawer / side panel.** The research favours it for looking at a record without leaving the
list, and it is the right home for a quick edit from a table. We have no screen today where the
list is long enough for leaving it to hurt. **Revisit when** a dense grid needs a record opened
without losing the grid.

**Command palette (Cmd/Ctrl+K).** A baseline expectation in tools with more than a dozen
destinations. **Revisit when** there are more than a dozen.

**Compact density toggle.** See §7.

**Batch selection in tables.** See §6.7.

**Keyboard shortcuts beyond the basics.** `/` to focus a list's search box is worth doing with
the next list screen; anything more waits for the palette.
