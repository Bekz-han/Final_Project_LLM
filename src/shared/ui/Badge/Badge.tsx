import clsx from 'clsx';
import { type ReactNode } from 'react';

/**
 * A state, said in a word.
 *
 * Before this, states were grey twelve-pixel text — "archived", "removed", "call first" —
 * which is a caption, not a status, and reads as something the eye may skip. A pill with a
 * ground behind it does not.
 *
 * `docs/design-system.md` §9: status is never colour alone. Every badge carries its word,
 * so the colour is the second signal and never the only one; that is also why there is no
 * dot-only variant and will not be.
 */

const TONES = {
	accent: 'bg-accent-subtle text-accent-fg',
	danger: 'bg-danger-subtle text-danger',
	info: 'bg-info-subtle text-info',
	/** The default: a fact about the row that is not good or bad. Archived, withdrawn, inactive. */
	neutral: 'bg-surface-sunken text-fg-muted border-border border',
	success: 'bg-success-subtle text-success',
	warning: 'bg-warning-subtle text-warning',
} as const;

export interface BadgeProps {
	children: ReactNode;
	className?: string;
	tone?: keyof typeof TONES;
}

export function Badge({ children, className, tone = 'neutral' }: BadgeProps) {
	return (
		<span
			className={clsx(
				'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
				TONES[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
