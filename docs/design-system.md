# Design System

Modern, minimal, and comfortable to read for eight hours at a stretch. Not decorative, not stripped of function.

This document is the **visual foundation**: tokens, palette, type, space, motion, accessibility.
How a screen is assembled from it — which control a task gets, how a form is laid out, what a
table row does, what every input field must declare — is `docs/ui-patterns.md`.

The rule that follows from "minimal but complete": **reduce visual noise, never reduce capability.** Density comes from restraint in colour and border weight, not from hiding features behind menus.

## 1. Token architecture

Three layers. Components use only layer 3.

```text
1. Palette      raw scales      --brand-600, --neutral-200
2. Semantic     roles           --color-canvas, --color-fg-muted, --color-accent
3. Component    local           built from layer 2 in the component
```

**1.1.** Components never reference a palette value directly. `bg-accent`, never `bg-brand-600`.

**1.2.** The dark theme redefines **only layer 2**, in one place in `src/app/globals.css`. No component contains a dark-mode colour.

**1.3.** Every colour has its light definition on bare `:root`. Nothing is defined only inside a media query or a `[data-theme]` block.

**1.4.** Theme resolution has three states: explicit light, explicit dark, and system. An inline script in the root layout applies the stored choice before first paint, so there is no flash.

```css
:root                                            { /* light */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"])                { /* dark */ }
}
:root[data-theme="dark"]                         { /* dark */ }
```

## 2. Palette

### 2.1. Brand — violet

Vivid, legible against both light and dark grounds, and clear of every semantic hue. It carries the product; it is not sprinkled around.

```text
--brand-50   #FAF5FF
--brand-100  #F3E8FF
--brand-200  #E9D5FF
--brand-300  #D8B4FE
--brand-400  #C084FC
--brand-500  #A855F7
--brand-600  #9333EA
--brand-700  #7E22CE
--brand-800  #6B21A8
--brand-900  #581C87
--brand-950  #3B0764
```

**2.1.1.** The accent fill is `--brand-600`, which measures 5.38:1 against white text.

The hue is chosen on contrast, not taste. A primary button is white text on the accent, so the accent must clear 4.5:1 — and teal, which this replaced, has no shade that is both accessible and vivid: `#0D8A80` measures 4.23 and fails, forcing the accent down to a dark, low-chroma `#0F6E67`. A projector crushes saturation in dark tones, so that rendered as near-black and the primary button stopped reading as primary.

**2.1.2.** The accent must not be confusable with the semantic hues of §2.3, because status and action appear side by side — most visibly in the agent activity panel, where success green and danger red sit beside accent-coloured controls. That rules out green, amber, orange and red accents outright, and makes blue awkward against `info`. The free zones are teal/cyan, indigo/violet and magenta. Violet is the vivid one among them.

### 2.2. Neutral — cool grey with a faint violet cast

Pure grey next to violet reads dirty. A trace of the brand hue in the neutrals makes the whole surface feel intentional.

Each step holds the OKLab lightness of the teal ladder it replaced; only the hue moved. That is what kept every contrast relationship and the whole sense of depth intact across the change.

```text
--neutral-0     #FFFFFF
--neutral-25    #FBFBFC
--neutral-50    #F6F6F8
--neutral-100   #EFEFF2
--neutral-150   #E7E7EA
--neutral-200   #DCDBE0
--neutral-300   #C5C4CB
--neutral-400   #A09EA7
--neutral-450   #8D8B95
--neutral-500   #77767E
--neutral-600   #5D5C64
--neutral-700   #49484F
--neutral-800   #323138
--neutral-900   #201F26
--neutral-950   #151419
--neutral-1000  #0B0B0E
```

**2.2.1.** The light canvas is `--neutral-25`, not white. Cards sit on it in white. Eight hours of pure `#FFFFFF` is what makes people tired.

**2.2.2.** The dark canvas is `#100F14`, not black. Pure black plus bright text causes halation.

**2.2.3.** `--neutral-450` exists for one token. `--color-fg-subtle` sat on `--neutral-400`, which measures 2.62:1 on a white surface and fails the 3:1 that §9 requires of UI text. `--neutral-450` measures 3.35:1 — still the quietest text on the screen, and now readable. Anything a person must actually read takes `fg-muted`, not `fg-subtle`.

### 2.3. Semantic hues

| Role | Light | Dark |
|---|---|---|
| Success | `#15803D` on `#ECFDF3` | `#5BD68C` on `#0E2A1B` |
| Warning | `#A15C07` on `#FEF6E7` | `#F5B942` on `#2E2109` |
| Danger | `#B42318` on `#FEF3F2` | `#F98080` on `#2E1311` |
| Info | `#175CD3` on `#EFF4FF` | `#84ADFF` on `#111C33` |

Four hues, and adding a fifth needs a reason: each one costs a light value, a dark value, a
tinted ground in both, and a contrast check against all four.

## 3. Semantic tokens

```text
--color-canvas            page background
--color-surface           cards, panels, table rows
--color-surface-raised    popovers, dialogs, dropdowns
--color-surface-sunken    inset areas, code, empty states
--color-overlay           the scrim behind a modal dialog

--color-border            default hairline
--color-border-strong     inputs, dividers that must be seen
--color-border-hover      the edge of a control under the pointer
--color-border-focus      focus ring

--color-fg                primary text
--color-fg-muted          secondary text, labels
--color-fg-subtle         placeholder, disabled
--color-fg-on-accent      text on an accent fill

--color-accent            primary actions
--color-accent-hover
--color-accent-active
--color-accent-subtle     tinted background
--color-accent-fg         accent-coloured text and icons
```

## 4. Status tokens

Status needs its own vocabulary, and its states must be distinguishable **without relying on
colour alone** — every state also differs in border, fill, or label.

| Token | Meaning | Treatment |
|---|---|---|
| `--status-free` | Available, nothing here yet | Surface, dashed border, accent tint on hover |
| `--status-booked` | Claimed, active | Surface-raised, 3px accent left border |
| `--status-suspended` | Held, but not in effect | Warning tint, dashed border, explicit label |
| `--status-cancelled` | Cancelled | Muted fill, struck-through title |
| `--status-unavailable` | Out of scope | Sunken surface, diagonal hatch |
| `--status-conflict` | Conflict | Danger border and icon |

Rename these to the domain's own words when it has them. What must survive the rename: two
states that mean different things never differ by hue alone. Roughly one man in twelve cannot
tell the danger tone from the warning tone, and a monochrome print cannot tell any of them apart.

**4.1.** "Suspended" must be visually distinct from "booked". That distinction is the whole point
of the status: the slot is taken, but nothing is happening in it.

## 5. Typography

**5.1.** Inter Variable, **served from our own origin**, via `next/font/google` with a system fallback stack.

**A runtime request to a font CDN is prohibited.** It carries the visitor's IP to foreign infrastructure, which contradicts `docs/14-data-protection-and-compliance-kz.md`. `next/font/google` does not make one: it fetches the files at build time, copies them into the application's static output and emits a `@font-face` pointing at our domain. Nothing in the rendered page names Google.

An earlier revision of this line said `next/font/local` and called Google Fonts prohibited outright. The rule it was protecting is about the visitor's request, not about where the file came from months earlier — so the build-time form satisfies it. What it costs instead: the build needs to reach Google once, and the font files are not in the repository. If an air-gapped or bit-reproducible build is ever needed, commit the files and switch to `next/font/local`; the rendered result is identical.

**5.2.** Add a subset for every script the interface actually uses — `cyrillic`, `greek`, `vietnamese`. Without it, those letters fall back to whatever the system has, in the middle of a word.

**5.3.** Scale, in a 14px base:

```text
xs    12px / 16   labels, table meta, badges
sm    13px / 18   secondary text
base  14px / 20   body, tables, forms
md    16px / 24   card titles
lg    18px / 26   section headings
xl    20px / 28   page titles
2xl   24px / 32   dashboard figures
3xl   30px / 38   rare, empty states
```

**5.4.** Weights 400, 500, 600. No 700 in the interface; if something needs more emphasis than 600, the layout is wrong.

**5.5.** Tabular figures (`font-variant-numeric: tabular-nums`) everywhere numbers align: money, counts, times, anything in a column.

## 6. Space, radius, elevation

**6.1.** A 4px grid. Spacing steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**6.2.** Radius: `sm` 6px (badges, inputs), `md` 8px (buttons, cards), `lg` 12px (dialogs, panels), `full` (avatars, pills).

**6.3.** In light theme, **prefer a border to a shadow**. Shadows are for things that genuinely float: dropdowns, dialogs, drag previews. A page of drop-shadowed cards is the look we are avoiding.

**6.4.** In dark theme, elevation is surface lightness, not shadow. Shadows barely read on a dark ground.

## 7. Density

Administrators work in tables all day.

- Default table row: 40px. Compact toggle: 32px. The choice is remembered per user.
- Form field height: 36px.
- Buttons: 32px small, 36px default, 40px large.
- Page gutter: 24px desktop, 16px tablet, 12px phone.
- Content max width: 1600px; a wide data grid is exempt and scrolls.

## 8. Motion

120–180ms, `ease-out`. Dialogs and popovers fade with a 4px translate; nothing bounces or slides across the screen.

`prefers-reduced-motion: reduce` disables transforms and keeps opacity changes only.

## 9. Accessibility

- Body text meets WCAG AA, 4.5:1. Large text and UI boundaries meet 3:1.
- Focus is always visible: a 2px `--color-border-focus` ring with a 2px offset. Never `outline: none` without a replacement.
- Status is never colour alone. Every state carries a shape, border, or label difference.
- Interactive targets are at least 40×40px on touch.
- Dialogs, menus, and tooltips come from Radix, so keyboard and screen-reader behaviour is correct by construction.

## 10. Components

Built on Radix primitives, styled with Tailwind, living in `src/shared/ui/`.

```text
Button, IconButton, Input, Textarea, Select, Combobox, DatePicker,
TimePicker, Checkbox, Radio, Switch, Badge, Avatar, Tooltip, Popover,
Dropdown, Dialog, Drawer, Tabs, Table, Pagination, Toast, Skeleton,
EmptyState, ErrorState, Callout, Card, Kbd, ThemeToggle
```

**10.0.** `Card` was not in this list and should have been. A bare `<section>` is not a landmark
— it becomes one only when it has an accessible name — so every card on every screen was an
unnamed region until a component owned the heading and the `aria-labelledby` together.

**10.0a.** `Avatar` has no photograph and will not get one: most products have no portraits of the
people in their rows, and a repeated placeholder silhouette is worse than nothing. It is initials
on one of eight grounds, chosen by a hash of the row's id — never of the name, because a person
who changes their name must not change colour in the list. §14's "one accent hue" still holds: the identity
palette carries no meaning and marks nothing, it only lets two adjacent rows differ.

**10.1.** No component kit that copies source into the repository. We own these files.

**10.2.** Every list surface ships its three states: loading (skeleton, not a spinner), empty (with the action that fills it), and error (with a retry). A screen without all three is not finished.

## 11. Page structure

Navigation is flat and each item is one job. Nothing important hides behind a menu.

```text
Dashboard    what needs doing today
<Section>    a list, and the records reached from it
<Section>    ...
Settings     account, branding, rules, users
```

Keep it flat, and keep each item one job. A second level of navigation is a sign that two
products are sharing a shell.


## 12. Branding

**12.1.** If the product is multi-tenant, a tenant uploads its own logo rather than choosing its
own colours.

```text
branding
  owner_id
  logo_asset_id           light backgrounds
  logo_dark_asset_id      optional, for the dark theme
  updated_by_id, updated_at
```

**12.2.** Constraints: SVG or PNG, at most 1 MB, at least 128px on the long edge. Rendered at a
fixed height (28px in the sidebar) with preserved aspect ratio. Without a logo, the name is set in
the brand wordmark.

**12.3.** A per-tenant accent colour is deliberately deferred. It requires contrast validation
against both themes before it can be allowed, and one logo is enough to make a tenant feel at home.

## 13. Theme switching

**13.1.** Three choices: light, dark, system. Stored per user, applied before first paint.

**13.2.** The toggle sits in the profile menu, not on the main toolbar. It is set once.

**13.3.** Both themes are first-class. Dark is not an afterthought: every screen is reviewed in both, and dense surfaces in particular are checked for status legibility in dark.

## 14. What we are not doing

- No gradients, glassmorphism, or decorative illustration.
- No coloured page backgrounds; colour marks meaning.
- No icon-only navigation. Icons accompany labels.
- No animated dashboard charts.
- No more than one accent hue.
