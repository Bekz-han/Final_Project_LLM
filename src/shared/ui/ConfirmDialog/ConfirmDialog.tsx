'use client';

import { AlertDialog } from 'radix-ui';
import { type ReactNode } from 'react';
import { Button } from '../Button';

/**
 * "Are you sure?", for the actions that take something away.
 *
 * The rule it settles: a consequential control must not fire the moment it is touched. Editing
 * has its own answer — a draft and an explicit save — but a button that *does* a thing rather
 * than changing a field has no equivalent, and "Suspend" sitting next to "History" is one
 * mis-click away from locking a colleague out.
 *
 * `AlertDialog` rather than `Dialog`: it is the primitive for a question with consequences.
 * Focus lands on Cancel, Escape cancels, the rest of the page is inert, and the description is
 * wired to the dialog for a screen reader. Radix owns all of that.
 *
 * It is not used for everything reversible. Archiving a row that is one click back with nothing
 * lost does not need it, and a confirmation there only teaches people to dismiss confirmations.
 */

export interface ConfirmDialogProps {
	/** What the button says. Name the action — "Suspend", not "OK". */
	confirmLabel: string;
	description: ReactNode;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	title: string;
	/** `danger` for anything that takes access or a relationship away. */
	tone?: 'danger' | 'default';
}

export function ConfirmDialog({
	confirmLabel,
	description,
	onConfirm,
	onOpenChange,
	open,
	title,
	tone = 'danger',
}: ConfirmDialogProps) {
	return (
		<AlertDialog.Root onOpenChange={onOpenChange} open={open}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className="bg-overlay fixed inset-0 z-40 opacity-0 transition-opacity data-[state=open]:opacity-100" />

				<AlertDialog.Content
					className={
						'border-border bg-surface fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] ' +
						'-translate-x-1/2 -translate-y-[calc(50%-4px)] flex-col gap-4 rounded-lg border p-5 opacity-0 ' +
						'shadow-lg transition-[opacity,transform] data-[state=open]:-translate-y-1/2 ' +
						'data-[state=open]:opacity-100'
					}
				>
					<div className="flex flex-col gap-1.5">
						<AlertDialog.Title className="text-fg font-semibold">{title}</AlertDialog.Title>
						<AlertDialog.Description className="text-fg-muted text-sm">{description}</AlertDialog.Description>
					</div>

					<div className="flex justify-end gap-2">
						<AlertDialog.Cancel asChild>
							<Button variant="secondary">Отмена</Button>
						</AlertDialog.Cancel>

						<AlertDialog.Action asChild>
							<Button onClick={onConfirm} variant={tone === 'danger' ? 'danger' : 'primary'}>
								{confirmLabel}
							</Button>
						</AlertDialog.Action>
					</div>
				</AlertDialog.Content>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}
