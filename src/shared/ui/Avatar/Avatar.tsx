import clsx from 'clsx';
import { IDENTITY_CLASSES, identitySlot, initials, type PersonName } from './identity';

/**
 * A person, as a circle with their initials in it.
 *
 * There is no photograph and there will not be one: most products have no portraits of the people
 * in their rows, and a placeholder silhouette repeated down a list is worse than nothing. What this
 * is for is the eye — a list of twenty names in one typeface is a wall, and two coloured
 * circles apart is where the administrator stops reading and starts finding.
 *
 * `colorKey` is the row's id, never the name. `identity.ts` has the reasoning and the test.
 *
 * `aria-hidden` on purpose: the name is always printed next to it, and a screen reader that
 * announces "AB" before "Alice Brown" has said the same thing twice, badly.
 */

const SIZES = {
	lg: 'size-12 text-md',
	md: 'size-9 text-sm',
	sm: 'size-7 text-xs',
} as const;

export interface AvatarProps {
	className?: string;
	/** The row's id. Stable for the life of the person, which the colour has to be. */
	colorKey: string;
	name: PersonName | string;
	size?: keyof typeof SIZES;
}

export function Avatar({ className, colorKey, name, size = 'md' }: AvatarProps) {
	return (
		<span
			aria-hidden
			className={clsx(
				'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
				IDENTITY_CLASSES[identitySlot(colorKey)],
				SIZES[size],
				className,
			)}
		>
			{initials(name)}
		</span>
	);
}
