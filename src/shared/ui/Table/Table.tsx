import clsx from 'clsx';
import { type ReactNode, type ThHTMLAttributes } from 'react';

/**
 * The house table, as three thin wrappers rather than one component with a `columns` prop.
 *
 * Three screens had the same class strings copied into them, and a fourth was about to. What
 * they do **not** share is structure: the catalogue puts an extra row under each row for its
 * history, the staff list spans every column for the same reason, and a configuration object
 * would have had to grow a hole for each of those. So the wrappers carry the appearance —
 * §7's 40px rows, §6.3's border instead of a shadow — and the screen keeps its own `<tr>`s.
 *
 * Not a client component. It has no state and no hooks, so it renders on the server for
 * whatever screen is not `'use client'` yet.
 */

export interface TableProps {
	children: ReactNode;
	className?: string;
	/** Named for a screen reader: a table is a region a person can jump to. */
	label: string;
}

export function Table({ children, className, label }: TableProps) {
	return (
		// A `<section>` with a name, not a `<div>`: the list is a landmark somebody can jump to,
		// and `Card` exists for the same reason — see `docs/design-system.md` §10.0.
		// `overflow-visible` from `md` up so the page, not this box, is the scroll container —
		// which is what lets the header stick to the top of the screen while the rows go past it.
		// Below `md` the box scrolls sideways instead, and a header stuck inside it would do
		// nothing anyway.
		<section
			aria-label={label}
			className={clsx('border-border bg-surface overflow-x-auto rounded-lg border md:overflow-visible', className)}
		>
			<table className="w-full min-w-md text-base">{children}</table>
		</section>
	);
}

export function TableHead({ children }: { children: ReactNode }) {
	return (
		<thead>
			<tr className="border-border bg-surface text-fg-muted sticky top-0 z-10 border-b text-left text-xs">
				{children}
			</tr>
		</thead>
	);
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
	children: ReactNode;
}

export function Th({ children, className, ...props }: ThProps) {
	return (
		<th className={clsx('px-4 py-2 font-medium', className)} {...props}>
			{children}
		</th>
	);
}

/**
 * A row of the body. 40px at rest — §7 — which `py-2.5` plus a 20px line box comes to.
 *
 * It answers the pointer. NN/g lists hover highlighting among the things that keep somebody
 * oriented while their eye travels from the name on the left to the number on the right, and a
 * table of forty rows without it is where people lose their line.
 */
export function Tr({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<tr className={clsx('border-border hover:bg-surface-hover border-b transition-colors last:border-0', className)}>
			{children}
		</tr>
	);
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
	return <td className={clsx('px-4 py-2.5', className)}>{children}</td>;
}
