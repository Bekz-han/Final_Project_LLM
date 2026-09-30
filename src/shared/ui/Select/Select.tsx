import clsx from 'clsx';
import { type SelectHTMLAttributes } from 'react';
import { CONTROL_BASE } from '../control';

/**
 * A closed list of choices, styled once.
 *
 * It exists because the class string for it was written out four times in four screens, with
 * three different heights and two different text sizes — the same select in a table row was
 * 32px and 13px, the same control on a card was 36px and 14px, and nobody decided that.
 * One component, two sizes, and the screens stop voting.
 *
 * A native `<select>` on purpose. It is correct with a keyboard, correct with a screen reader,
 * and on a phone it opens the platform's own wheel — none of which a div-with-a-listbox gets
 * right for free, and all of which an administrator uses forty times a day.
 */

const SIZES = {
	md: 'h-9 px-2 text-base',
	/** Table rows, where 36px controls make every row 44px tall. */
	sm: 'h-8 px-2 text-sm',
} as const;

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
	/** Not the HTML `size` attribute — that one means "show N rows", and nothing here wants it. */
	size?: keyof typeof SIZES;
}

export function Select({ className, size = 'md', ...props }: SelectProps) {
	return <select className={clsx(CONTROL_BASE, SIZES[size], className)} {...props} />;
}
