'use client';

import { CheckCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { Toast as Primitive } from 'radix-ui';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { ToastContext, type ToastTone } from './useToast';

/**
 * "Saved", said once and then gone.
 *
 * Until this existed a save said nothing at all: the row stopped showing its buttons and that
 * was the whole confirmation. On a screen where the save button only appears when something
 * has changed, the button disappearing is also what a failure looks like.
 *
 * **Success only, by convention.** An error stays on the screen in a `Callout`, because the
 * person has to read it while they fix the thing it is about, and a message that removes itself
 * after four seconds is the wrong shape for that. The danger tone here is for a failure with
 * nowhere else to go — an action fired from a row, with no form to attach a message to.
 *
 * Radix owns the behaviour: a toast is a live region, it pauses on hover and on focus, swipe
 * and Escape dismiss it, and the viewport is reachable by keyboard. None of that is worth
 * reimplementing, and all of it is wrong when it is.
 */

interface Notice {
	id: number;
	message: string;
	tone: ToastTone;
}

/** Four seconds: long enough to read six words, short enough not to sit over the next row. */
const DURATION_MS = 4000;

const TONES = {
	danger: { className: 'text-danger', Icon: XCircleIcon },
	success: { className: 'text-success', Icon: CheckCircleIcon },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
	const [notices, setNotices] = useState<readonly Notice[]>([]);

	const notify = useCallback((message: string, tone: ToastTone = 'success') => {
		// The id is the clock rather than a counter, so two notices raised in the same tick from
		// two different handlers cannot collide on a React key.
		setNotices((current) => [...current, { id: Date.now() + current.length, message, tone }]);
	}, []);

	const api = useMemo(() => ({ notify }), [notify]);

	return (
		<ToastContext value={api}>
			<Primitive.Provider duration={DURATION_MS} swipeDirection="right">
				{children}

				{notices.map((notice) => {
					const { className, Icon } = TONES[notice.tone];

					return (
						<Primitive.Root
							className={clsx(
								'border-border bg-surface flex items-start gap-2 rounded-lg border p-3 shadow-lg',
								// §8: fade with a 4px translate. The reduced-motion rule in globals.css
								// flattens the duration for everybody who asked for that.
								'translate-y-1 opacity-0 transition-[opacity,transform]',
								'data-[state=closed]:translate-y-1 data-[state=closed]:opacity-0',
								'data-[state=open]:translate-y-0 data-[state=open]:opacity-100',
							)}
							key={notice.id}
							onOpenChange={(open) => {
								if (!open) {
									setNotices((current) => current.filter((item) => item.id !== notice.id));
								}
							}}
						>
							<Icon aria-hidden className={clsx('mt-0.5 size-4 shrink-0', className)} />
							<Primitive.Title className="text-fg text-sm">{notice.message}</Primitive.Title>
							<Primitive.Close
								aria-label="Закрыть"
								className="text-fg-subtle hover:text-fg ml-auto cursor-pointer transition-colors"
							>
								<XMarkIcon aria-hidden className="size-4" />
							</Primitive.Close>
						</Primitive.Root>
					);
				})}

				<Primitive.Viewport className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
			</Primitive.Provider>
		</ToastContext>
	);
}
