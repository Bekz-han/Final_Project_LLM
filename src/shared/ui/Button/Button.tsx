import clsx from 'clsx';
import { Slot } from 'radix-ui';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * The one button.
 *
 * Sizes and radii come from `docs/design-system.md` §6 and §7 and are not negotiable per
 * screen: 32, 36 and 40 pixels, 8px radius. Density is the point of having them.
 *
 * There is no focus style here. `globals.css` puts a 2px ring on `:focus-visible` for
 * everything, so a component that styles its own focus is either duplicating that or quietly
 * disagreeing with it.
 *
 * `asChild` renders the child element instead of a `button`, which is how a link gets button
 * styling without a button wrapping an anchor. It comes from Radix rather than being written
 * here because merging props and refs onto an unknown child is fiddly and already solved.
 */

const BASE =
	'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors ' +
	'disabled:pointer-events-none disabled:opacity-50';

const VARIANTS = {
	/** The button that takes something away, in a confirmation. Never on a row by itself. */
	danger: 'bg-danger text-on-accent hover:bg-danger-hover',
	/** Toolbars and table rows, where a border on every control would be noise. */
	ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
	/** The single accent action on a screen. More than one means the screen has no answer. */
	primary: 'bg-accent text-on-accent hover:bg-accent-hover',
	secondary: 'border-border-strong bg-surface text-fg hover:bg-surface-hover border',
} as const;

/** 40, 36 and 32 pixels — docs/design-system.md §7. Alphabetical because the linter sorts object keys. */
const SIZES = {
	lg: 'h-10 px-5 text-base',
	md: 'h-9 px-4 text-base',
	sm: 'h-8 px-3 text-sm',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	asChild?: boolean;
	children: ReactNode;
	size?: keyof typeof SIZES;
	variant?: keyof typeof VARIANTS;
}

export function Button({ asChild = false, className, size = 'md', variant = 'primary', ...props }: ButtonProps) {
	const Component = asChild ? Slot.Root : 'button';

	return (
		<Component
			className={clsx(BASE, VARIANTS[variant], SIZES[size], className)}
			// An explicit default: a button inside a form submits it unless told otherwise, and
			// that has surprised everyone at least once.
			type={asChild ? undefined : (props.type ?? 'button')}
			{...props}
		/>
	);
}
