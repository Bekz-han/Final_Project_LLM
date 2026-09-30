'use client';

import { DEFAULT_THEME, type Theme, THEME_STORAGE_KEY } from '@shared/lib';
import { useSyncExternalStore } from 'react';

/**
 * The theme lives outside React: in localStorage and on the root element's data-theme, both
 * written by the init script before hydration. useSyncExternalStore is the supported way to
 * read that without setting state from an effect, and it hydrates against getServerSnapshot
 * so the server and the first client render agree.
 */
const listeners = new Set<() => void>();
let cached: Theme | null = null;

function read(): Theme {
	if (cached !== null) return cached;
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		cached = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : DEFAULT_THEME;
	} catch {
		cached = DEFAULT_THEME;
	}
	return cached;
}

function subscribe(onStoreChange: () => void): () => void {
	listeners.add(onStoreChange);
	return () => listeners.delete(onStoreChange);
}

function getServerSnapshot(): Theme {
	return DEFAULT_THEME;
}

function apply(next: Theme): void {
	cached = next;
	const root = document.documentElement;
	if (next === 'system') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', next);
	try {
		localStorage.setItem(THEME_STORAGE_KEY, next);
	} catch {
		/* private mode or blocked storage — the choice just does not persist */
	}
	listeners.forEach((listener) => {
		listener();
	});
}

const OPTIONS: { label: string; value: Theme }[] = [
	{ label: 'Светлая', value: 'light' },
	{ label: 'Тёмная', value: 'dark' },
	{ label: 'Системная', value: 'system' },
];

export function ThemeToggle() {
	const theme = useSyncExternalStore(subscribe, read, getServerSnapshot);

	return (
		<div
			aria-label="Тема оформления"
			className="border-border bg-surface inline-flex rounded-md border p-0.5"
			role="radiogroup"
		>
			{OPTIONS.map((option) => (
				<button
					aria-checked={theme === option.value}
					className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
						theme === option.value ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg'
					}`}
					key={option.value}
					onClick={() => {
						apply(option.value);
					}}
					role="radio"
					type="button"
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
