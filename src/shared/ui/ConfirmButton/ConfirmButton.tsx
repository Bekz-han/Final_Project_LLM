'use client';

import { type ReactNode, useState } from 'react';
import { Button, type ButtonProps } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';

/**
 * A button that asks before it does the thing.
 *
 * The alternative was a `Question | null` in every screen, a `<ConfirmDialog>` at the bottom of
 * every screen, and a `setAsking({ … })` at every call site — three places to keep in step for
 * one button. Here the question travels with the button that raises it, and a screen that gains
 * a destructive action gains a confirmation with it rather than remembering to.
 *
 * Each of these owns its own dialog. That is not a row of hidden dialogs: Radix renders nothing
 * at all while `open` is false, so a table of forty rows carries forty booleans and no markup.
 *
 * Only for what takes something away. Archiving a programme is one click back with nothing
 * lost, and a confirmation on it would teach people to dismiss confirmations.
 */

export interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
	/** The dialog's own button. Name the action — "Suspend", not "OK". */
	confirmLabel: string;
	description: ReactNode;
	onConfirm: () => void;
	title: string;
	tone?: 'danger' | 'default';
}

export function ConfirmButton({
	children,
	confirmLabel,
	description,
	onConfirm,
	title,
	tone = 'danger',
	...button
}: ConfirmButtonProps) {
	const [asking, setAsking] = useState(false);

	return (
		<>
			<Button
				{...button}
				onClick={() => {
					setAsking(true);
				}}
			>
				{children}
			</Button>

			<ConfirmDialog
				confirmLabel={confirmLabel}
				description={description}
				onConfirm={onConfirm}
				onOpenChange={setAsking}
				open={asking}
				title={title}
				tone={tone}
			/>
		</>
	);
}
