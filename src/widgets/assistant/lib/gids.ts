/**
 * Finding gids in what the assistant says and in what its tools returned.
 *
 * A gid is a bank-internal node id: 18 digits, around 1e17. That is past
 * `Number.MAX_SAFE_INTEGER` (about 9e15), so a gid is **always a string** here. `Number(gid)`
 * would silently round it to a neighbouring id — the graph would then focus the wrong person, and
 * nothing would say so. Nothing in this file converts a gid to a number, and nothing should.
 *
 * "Gid-like" is a run of 15–20 digits that is not glued to a letter, a digit or an underscore on
 * either side. The bounds are lookarounds rather than `\b`, because JavaScript's `\b` only knows
 * ASCII word characters: in «узел100000003684369100» a Cyrillic letter counts as a boundary to `\b`.
 * Short numbers — counts, percentages, "2248 rows" — stay text.
 */

const GID_BODY = String.raw`\d{15,20}`;
const BEFORE = String.raw`(?<![\p{L}\p{N}_])`;
const AFTER = String.raw`(?![\p{L}\p{N}_])`;

/** Global, for scanning text. Build a fresh one per scan: a global regex carries `lastIndex`. */
function gidScanner(): RegExp {
	return new RegExp(`${BEFORE}${GID_BODY}${AFTER}`, 'gu');
}

const WHOLE_GID = new RegExp(`^${GID_BODY}$`, 'u');

/** Keys whose values are gids by contract, whatever their length. */
const GID_KEYS: ReadonlySet<string> = new Set(['gid', 'gids', 'removed', 'sources', 'topGids']);

const DIGITS_ONLY = /^\d+$/u;

export type TextSegment = { gid: string; kind: 'gid' } | { kind: 'text'; text: string };

/** True for a string that is exactly one gid. */
export function isGid(value: string): boolean {
	return WHOLE_GID.test(value);
}

/**
 * Splits text into plain runs and gids, in order. Joining the segments back gives the input.
 * Empty text runs are never emitted.
 */
export function splitGids(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	let cursor = 0;

	for (const match of text.matchAll(gidScanner())) {
		const start = match.index;

		if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) });
		segments.push({ gid: match[0], kind: 'gid' });
		cursor = start + match[0].length;
	}

	if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });

	return segments;
}

/**
 * Every gid in a JSON value — a tool's arguments or its result — in first-seen order, deduplicated.
 *
 * A string counts if it is exactly gid-shaped, or contains gids in running text, or sits under a
 * key that carries gids by contract (`gid`, `gids`, `sources`, `topGids`, `removed`) and is all
 * digits. Numbers are skipped on purpose: a gid that arrived as a JSON number has already been
 * rounded, and offering it as a link would focus the wrong node.
 */
export function collectGids(value: unknown): string[] {
	const found = new Set<string>();

	const visit = (node: unknown, gidKey: boolean) => {
		if (typeof node === 'string') {
			if (gidKey && DIGITS_ONLY.test(node)) {
				found.add(node);
				return;
			}

			for (const segment of splitGids(node)) {
				if (segment.kind === 'gid') found.add(segment.gid);
			}

			return;
		}

		if (Array.isArray(node)) {
			for (const item of node) visit(item, gidKey);
			return;
		}

		if (typeof node === 'object' && node !== null) {
			for (const [key, child] of Object.entries(node)) visit(child, GID_KEYS.has(key));
		}
	};

	visit(value, false);

	return [...found];
}
