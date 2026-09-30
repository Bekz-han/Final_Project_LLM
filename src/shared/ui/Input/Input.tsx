import clsx from 'clsx';
import { type InputHTMLAttributes } from 'react';
import { CONTROL_BASE } from '../control';

/**
 * A text field, 36px tall, per `docs/design-system.md` §7.
 *
 * `border-strong` rather than `border`: an input has to be findable at a glance on a page of
 * cards, and the hairline used for panel edges is not enough on its own.
 *
 * **It answers the pointer.** Until it did, the only way to tell a field from a bordered box
 * was to click it. The hover edge is its own token — see `--color-border-hover` — because
 * reusing the focus colour would make hovering look like focus, and focus is what tells a
 * keyboard user where they are.
 *
 * `aria-invalid` carries the error state rather than a prop, because that is the attribute a
 * screen reader reads and the one `Field` already sets. Two sources for one fact is how they
 * drift apart.
 *
 * `autoComplete` is **off by default, deliberately.** Every field on these screens is data
 * about somebody else — another person's phone, another person's email — and a browser offering the
 * administrator's own details there is worse than useless: it is one Tab away from filing the
 * receptionist's number under a child. The sign-in, invitation and two-factor screens pass a
 * real token, because those fields are the person's own.
 */
export function Input({ autoComplete = 'off', className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input autoComplete={autoComplete} className={clsx(CONTROL_BASE, 'h-9 px-3 text-base', className)} {...props} />
	);
}
