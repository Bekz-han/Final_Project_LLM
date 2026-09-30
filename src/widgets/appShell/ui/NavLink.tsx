'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

/**
 * One navigation entry, which knows whether it is the one you are on.
 *
 * Its own component so that `AppShell` stays a Server Component: `usePathname` is a hook, and
 * making the whole frame a client one to light a single row would ship the shell to the browser
 * for nothing.
 *
 * The icon arrives as `children`, already rendered. It cannot arrive as part of a `section`
 * object: `NavigationSection.Icon` is a component *reference*, and a function is not one of the
 * things that crosses from a Server Component to a client one — React refuses the whole tree
 * with "Only plain objects can be passed to Client Components". An element is fine; the
 * component that made it is not. Typecheck and lint both pass on the broken version, so the
 * only thing that catches it is opening the page.
 *
 * `aria-current="page"` is not decoration. Colour alone is not a state — `docs/design-system.md`
 * §9 — so the active entry also gains weight and a ground, and says so out loud to a screen reader.
 */

/**
 * A section is current when the path is it, or sits beneath it. `startsWith` alone is wrong:
 * `/note` would light up for `/notes`, so the next character has to be a boundary.
 */
function isSectionActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The selected entry is filled with the accent, not tinted with it.
 *
 * It was `bg-accent-subtle` first, and measured **1.26:1** against the sidebar in the dark
 * theme and 1.06:1 in the light one — against a 3:1 floor for a non-text element. That is not
 * a faint state, it is no state: the tinted grounds exist to sit behind a paragraph of text,
 * and asking one to mark a row on a surface almost its own colour was the wrong job for them.
 * Filled, it measures over 6:1 in both themes.
 *
 * `hover` cannot use `surface-sunken` either — in the dark theme that is *darker* than the
 * sidebar, so the row dented instead of lifting. `surface-hover` is the token for this.
 */
const VARIANTS = {
	header: {
		active: 'bg-accent text-on-accent font-medium',
		base: 'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors',
		idle: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
	},
	sidebar: {
		active: 'bg-accent text-on-accent font-medium',
		base: 'flex items-center gap-2.5 rounded-md px-2 py-2 text-base transition-colors',
		idle: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
	},
} as const;

export interface NavLinkProps {
	/** The icon, rendered by the caller. See above for why it is not a component prop. */
	children: ReactNode;
	href: string;
	label: string;
	variant: keyof typeof VARIANTS;
}

export function NavLink({ children, href, label, variant }: NavLinkProps) {
	const pathname = usePathname();
	const active = isSectionActive(pathname, href);
	const styles = VARIANTS[variant];

	return (
		<Link
			aria-current={active ? 'page' : undefined}
			className={clsx(styles.base, active ? styles.active : styles.idle)}
			href={href}
		>
			{children}
			{label}
		</Link>
	);
}
