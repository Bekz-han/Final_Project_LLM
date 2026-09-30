import clsx from 'clsx';
import { type ReactNode, useId } from 'react';

/**
 * A titled panel, and the reason it is a component rather than four copied class strings.
 *
 * A bare `<section>` is **not** a landmark. It becomes one only when it has an accessible
 * name, and until this existed every card on every screen was an unnamed region: a screen
 * reader offered its user eight identical "region" entries to choose between. Owning the
 * heading here is what lets `aria-labelledby` be correct without anybody remembering it.
 *
 * `useId` makes this a client component in practice — it is a hook. Every screen that uses it
 * is `'use client'` already, and `Field` sets the same precedent for the same reason.
 */
export interface CardProps {
	/** Usually a button, in the top right, about the whole card. */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	description?: ReactNode;
	title: string;
}

export function Card({ action, children, className, description, title }: CardProps) {
	const titleId = useId();

	return (
		<section
			aria-labelledby={titleId}
			className={clsx('border-border bg-surface flex flex-col gap-4 rounded-lg border p-5', className)}
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-fg font-semibold" id={titleId}>
						{title}
					</h2>
					{description !== undefined && <p className="text-fg-muted mt-0.5 text-xs">{description}</p>}
				</div>

				{action}
			</div>

			{children}
		</section>
	);
}
