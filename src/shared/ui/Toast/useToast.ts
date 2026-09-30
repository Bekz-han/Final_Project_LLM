'use client';

import { createContext, useContext } from 'react';

/**
 * The context the provider fills and every screen reads.
 *
 * In its own file because Fast Refresh only re-runs a module that exports components alone —
 * a hook exported beside `ToastProvider` makes every edit to a screen remount the provider and
 * lose whatever it was showing.
 */

export type ToastTone = 'danger' | 'success';

export interface ToastApi {
	notify: (message: string, tone?: ToastTone) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * The one way a screen raises a notice.
 *
 * It throws outside the provider rather than returning a no-op: a save that silently says
 * nothing is the bug this component exists to fix, and a no-op would hide it again.
 */
export function useToast(): ToastApi {
	const api = useContext(ToastContext);

	if (api === null) {
		throw new Error('useToast() needs a <ToastProvider> above it.');
	}

	return api;
}
