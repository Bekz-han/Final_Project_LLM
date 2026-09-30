import tailwind from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * The stylesheet is built here and asserted, because the way it fails is by producing
 * nothing.
 *
 * Tailwind's automatic source detection emitted an empty file in this project — no error, a
 * clean build log, a dev server answering 200, and every page rendering as unstyled HTML. It
 * reached a browser that way. Nothing in typecheck, lint or the rest of the suite looks at
 * CSS, so nothing could have caught it.
 *
 * The size assertion is the crude half and the one that would have failed. The rest is the
 * design system's own rules from `docs/design-system.md`, which are otherwise prose.
 */

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'globals.css');
const SOURCE = readFileSync(FILE, 'utf8');

const built = await postcss([tailwind()]).process(SOURCE, { from: FILE });
const { css } = built;

/** Utilities that components in this repository already depend on. */
const REQUIRED_UTILITIES = [
	'.bg-canvas',
	'.bg-surface',
	'.text-fg',
	'.text-fg-muted',
	'.bg-accent',
	'.text-on-accent',
	'.border-border',
	'.font-sans',
	'.rounded-lg',
	'.bg-danger-subtle',
];

describe('the compiled stylesheet', () => {
	it('is not empty, which is how Tailwind fails here', () => {
		// Zero bytes is the observed failure mode, and 19KB the observed success. Anything in
		// between means most of the sheet went missing, which is worth failing on too.
		expect(css.length).toBeGreaterThan(10_000);
	});

	it.each(REQUIRED_UTILITIES)('emits %s', (utility) => {
		expect(css).toContain(utility);
	});

	it('carries the font the layout asks for', () => {
		expect(css).toContain('--font-inter');
	});
});

describe('the token architecture', () => {
	/**
	 * docs/design-system.md §1.3: every colour has its light definition on bare `:root`, and nothing is
	 * defined only inside a media query or a `[data-theme]` block.
	 *
	 * Break it and the failure is invisible in whichever theme the author happened to be
	 * looking at — which is the specific reason the rule exists.
	 */
	// The Tailwind bridge is a different layer: it declares alias names (--color-on-accent for
	// --color-fg-on-accent) so utilities read well, and those are not semantic tokens. Sweeping
	// it in was this check's first finding, against itself.
	const semanticLayer = SOURCE.replace(/@theme inline \{[^}]*\}/g, '');
	const declared = [...semanticLayer.matchAll(/(--color-[a-z-]+):/g)].map(([, name]) => name);
	const bareRoot = /(?:^|\n):root \{([^}]*)\}/g;
	const lightBlocks = [...SOURCE.matchAll(bareRoot)].map(([, body]) => body).join('\n');

	it('finds the tokens to check, so an empty sweep cannot pass', () => {
		expect(new Set(declared).size).toBeGreaterThan(15);
	});

	it('defines every semantic colour on bare :root', () => {
		const missing = [...new Set(declared)].filter((name) => !lightBlocks.includes(`${name}:`));

		expect(missing).toEqual([]);
	});

	it('redefines the dark theme in both places, so an explicit choice wins', () => {
		// A system-preference block without the explicit one means the toggle cannot switch
		// back to dark on a light machine.
		expect(SOURCE).toContain('@media (prefers-color-scheme: dark)');
		// Quote-agnostic: Prettier rewrites `"dark"` to `'dark'` in CSS, and the two selectors
		// are identical to a browser. An earlier version of this assertion spelled one of them
		// out and went red the first time anybody ran `pnpm format`.
		expect(SOURCE).toMatch(/:root\[data-theme=["']dark["']\]/);
	});
});

/**
 * docs/design-system.md §9: body text meets 4.5:1, UI text and boundaries meet 3:1 — in **both** themes.
 *
 * Prose cannot enforce that, and an eye cannot measure it. This resolves each token through its
 * `var()` chain exactly as a browser would, per theme, and measures the pairs that actually
 * appear on screen. It exists because the palette is the one thing in this repository that a
 * person is likely to change on taste, at speed, the night before it matters — and a hue that
 * looks right at 02:00 on a laptop can be illegible on a projector and unmeasured either way.
 *
 * `fg-subtle` was shipping at 2.62:1 before this existed.
 */
function tokensIn(text: string): Record<string, string> {
	const found: Record<string, string> = {};

	for (const [, name, value] of text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
		if (name !== undefined && value !== undefined) found[name] = value.trim();
	}

	return found;
}

const LIGHT_TOKENS = tokensIn(
	[...SOURCE.matchAll(/(?:^|\n):root \{([\s\S]*?)\n\}/g)].map(([, body]) => body).join('\n'),
);
const DARK_TOKENS = {
	...LIGHT_TOKENS,
	...tokensIn(/:root\[data-theme=['"]dark['"]\] \{([\s\S]*?)\n\}/.exec(SOURCE)?.[1] ?? ''),
};

/** Follows `var(--x)` to the hex it ends at, the way the cascade does. */
function resolve(tokens: Record<string, string>, name: string): string {
	let value = tokens[name] ?? '';

	// Bounded rather than recursive: a token defined in terms of itself is a typo, not a reason
	// for the suite to hang.
	for (let hop = 0; hop < 8; hop += 1) {
		const indirect = /^var\((--[a-z0-9-]+)\)$/.exec(value);

		if (indirect === null) break;

		value = tokens[indirect[1] ?? ''] ?? '';
	}

	return value;
}

function luminance(hex: string): number {
	const channels = [1, 3, 5]
		.map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
		.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

	return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

interface Pair {
	background: string;
	foreground: string;
	/** 4.5 for text, 3 for the deliberately quiet ones. docs/design-system.md §9. */
	minimum: number;
}

function contrast(tokens: Record<string, string>, pair: Pair): number {
	const [fg, bg] = [resolve(tokens, pair.foreground), resolve(tokens, pair.background)];

	if (!fg.startsWith('#') || !bg.startsWith('#')) {
		throw new Error(`${pair.foreground} or ${pair.background} did not resolve to a hex colour: ${fg} / ${bg}`);
	}

	const [a, b] = [luminance(fg), luminance(bg)];

	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const PAIRS: readonly Pair[] = [
	{ background: '--color-canvas', foreground: '--color-fg', minimum: 4.5 },
	{ background: '--color-surface', foreground: '--color-fg', minimum: 4.5 },
	{ background: '--color-surface', foreground: '--color-fg-muted', minimum: 4.5 },
	{ background: '--color-surface', foreground: '--color-fg-subtle', minimum: 3 },
	// The primary button: white text on the accent fill. This is the pair that decides the hue.
	{ background: '--color-accent', foreground: '--color-fg-on-accent', minimum: 4.5 },
	{ background: '--color-surface', foreground: '--color-accent-fg', minimum: 4.5 },
	{ background: '--color-accent-subtle', foreground: '--color-accent-fg', minimum: 4.5 },
	{ background: '--color-success-bg', foreground: '--color-success', minimum: 4.5 },
	{ background: '--color-warning-bg', foreground: '--color-warning', minimum: 4.5 },
	{ background: '--color-danger-bg', foreground: '--color-danger', minimum: 4.5 },
	{ background: '--color-info-bg', foreground: '--color-info', minimum: 4.5 },
];

describe.each([
	['light', LIGHT_TOKENS],
	['dark', DARK_TOKENS],
])('contrast in the %s theme', (_theme, tokens) => {
	it('finds the tokens to check, so an empty sweep cannot pass', () => {
		expect(Object.keys(tokens).length).toBeGreaterThan(30);
	});

	it.each(PAIRS)('$foreground on $background clears $minimum:1', (pair) => {
		expect(contrast(tokens, pair)).toBeGreaterThanOrEqual(pair.minimum);
	});
});
