/**
 * Number formatting for the screen, written out rather than delegated to `Intl`.
 *
 * The screen renders on the server and again in the browser, and `Intl` output depends on the
 * ICU build: one side printing a narrow no-break space where the other prints a no-break space is
 * a hydration mismatch over a character nobody can see. Doing it by hand makes both sides agree.
 */

const NBSP = ' ';

/** 1234567.8 → «1 234 568», grouped with no-break spaces the way ru-RU writes it. */
export function formatInteger(value: number): string {
	const rounded = Math.round(value);
	const sign = rounded < 0 ? '−' : '';

	return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatKzt(value: number): string {
	return `${formatInteger(value)}${NBSP}₸`;
}

const COMPACT_STEPS = [
	{ divisor: 1e9, unit: 'млрд' },
	{ divisor: 1e6, unit: 'млн' },
	{ divisor: 1e3, unit: 'тыс.' },
] as const;

/** 1 234 567 890 → «1,2 млрд ₸». For the header, where the exact figure is in the tooltip. */
export function formatKztCompact(value: number): string {
	const step = COMPACT_STEPS.find(({ divisor }) => Math.abs(value) >= divisor);

	if (step === undefined) return formatKzt(value);

	return `${(value / step.divisor).toFixed(1).replace('.', ',')}${NBSP}${step.unit}${NBSP}₸`;
}

/** A 0–1 score with two decimals and a decimal comma. */
export function formatScore(value: number): string {
	return value.toFixed(2).replace('.', ',');
}

export function formatShare(value: number): string {
	return `${Math.round(value * 100)}%`;
}

/** 'YYYY-MM-DD' → «DD.MM.YYYY», by the string: a Date would move it a day west of Greenwich. */
export function formatDate(iso: string): string {
	const [year, month, day] = iso.split('-');

	return `${day}.${month}.${year}`;
}

/** Two ISO dates → «01.07–31.07.2026» within one year, the full pair otherwise. Fits a stats cell. */
export function formatPeriod(from: string, to: string): string {
	if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatDate(from)} – ${formatDate(to)}`;

	return `${formatDate(from).slice(0, 5)}–${formatDate(to)}`;
}

/**
 * The cut the header's «Высокий приоритет» counts from. A fixed number rather than a percentile,
 * so the count means something: on the case data about one node in twenty-three clears it.
 */
export const HIGH_PRIORITY_CUT = 0.4;

/** Above this a priority is shown in the danger tone; between it and the cut, in the warning tone. */
export const TOP_PRIORITY_CUT = 0.5;

export type PriorityTone = 'high' | 'low' | 'top';

export function priorityTone(score: number): PriorityTone {
	if (score >= TOP_PRIORITY_CUT) return 'top';
	if (score >= HIGH_PRIORITY_CUT) return 'high';

	return 'low';
}

/** Literal classes, so Tailwind emits them. The number is always printed beside the colour. */
export const PRIORITY_TEXT_CLASS: Record<PriorityTone, string> = {
	high: 'text-warning',
	low: 'text-fg-muted',
	top: 'text-danger',
};

export const PRIORITY_BAR_CLASS: Record<PriorityTone, string> = {
	high: 'bg-warning',
	low: 'bg-fg-subtle',
	top: 'bg-danger',
};
