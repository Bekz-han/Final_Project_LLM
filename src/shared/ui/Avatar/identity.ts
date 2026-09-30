/**
 * Which two letters a person is shown as, and which of the eight colours is theirs.
 *
 * Both answers must be stable for the life of the row, which is why the colour comes from the
 * id and never from the name. A person who changes their name keeps their row; if the colour moved
 * with it, the administrator who had learned to find her by the violet circle would have to
 * learn again, and the row would look like somebody new.
 *
 * The initials are always surname-then-given-name, whatever order the screen prints the name
 * in. Lists sort by surname while cards read given-name-first, so the two disagree by design —
 * and a person whose glyphs flip between screens is two people as far as the eye is concerned.
 */

/** Written out rather than built from a template: Tailwind scans source text, and
 *  `bg-identity-${slot}-subtle` is a class it would never see and never generate. */
export const IDENTITY_CLASSES = [
	'bg-identity-1-subtle text-identity-1',
	'bg-identity-2-subtle text-identity-2',
	'bg-identity-3-subtle text-identity-3',
	'bg-identity-4-subtle text-identity-4',
	'bg-identity-5-subtle text-identity-5',
	'bg-identity-6-subtle text-identity-6',
	'bg-identity-7-subtle text-identity-7',
	'bg-identity-8-subtle text-identity-8',
] as const;

export interface PersonName {
	first: string;
	last: string;
}

/**
 * A grapheme, not a code unit and not a code point.
 *
 * `word[0]` splits a surrogate pair and `[...word][0]` splits a combining mark off its letter —
 * "Йосеф" typed with a combining breve would come back as a bare И with a floating accent. One
 * segmenter, made once: constructing it per call is the expensive part.
 */
const GRAPHEMES = new Intl.Segmenter('ru', { granularity: 'grapheme' });

function firstLetter(word: string): string {
	const [grapheme] = GRAPHEMES.segment(word);

	return grapheme?.segment.toUpperCase() ?? '';
}

export function initials(name: PersonName | string): string {
	if (typeof name !== 'string') {
		return `${firstLetter(name.last)}${firstLetter(name.first)}` || '—';
	}

	const words = name.split(/\s+/u).filter((word) => word !== '');

	return words.slice(0, 2).map(firstLetter).join('') || '—';
}

/**
 * FNV-1a over the whole string.
 *
 * Over the **whole** string on purpose. Our ids are uuid v7, whose leading bytes are a
 * millisecond timestamp: anything that reads only a prefix gives every row imported in the
 * same batch the same colour, which is the one case where telling rows apart matters most.
 */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function identitySlot(key: string): number {
	let accumulated = FNV_OFFSET;

	for (const character of key) {
		// eslint-disable-next-line no-bitwise -- FNV-1a is defined in terms of xor
		accumulated ^= character.codePointAt(0) ?? 0;
		accumulated = Math.imul(accumulated, FNV_PRIME);
	}

	// eslint-disable-next-line no-bitwise -- and in terms of an unsigned 32-bit result
	return (accumulated >>> 0) % IDENTITY_CLASSES.length;
}
