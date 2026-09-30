/**
 * The shape every form control shares: the border, the ground, the states.
 *
 * It lives beside the components rather than inside one of them because `Select` and `Textarea`
 * are not variants of `Input` — they are siblings, and having them import their appearance from
 * a text field is how a "small change to the input" silently restyles every dropdown in the
 * product. One string, three consumers, no hierarchy between them.
 *
 * What it does **not** decide: height, padding and text size. Those belong to the control and to
 * where it sits — a select in a table row is 32px, the same select on a card is 36px.
 */
export const CONTROL_BASE =
	'border-border-strong bg-surface text-fg placeholder:text-fg-subtle w-full rounded-sm border ' +
	'transition-colors hover:border-border-hover ' +
	'disabled:bg-surface-sunken disabled:text-fg-subtle disabled:hover:border-border-strong ' +
	'aria-[invalid=true]:border-danger';
