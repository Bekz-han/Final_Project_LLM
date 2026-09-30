/**
 * The little Markdown a chat model writes anyway, reduced to what a plain-text bubble can show.
 *
 * Models emphasise with `**bold**` and head sections with `### …` no matter what the prompt says,
 * and a bubble that prints the asterisks looks broken on a projector. Only those two are handled:
 * bold becomes a strong segment, and a heading line loses its hashes and becomes bold. Everything
 * else — numbered lists, dashes — already reads fine as text with `whitespace-pre-wrap`.
 */

export interface MarkdownSegment {
	strong: boolean;
	text: string;
}

const HEADING = /^#{1,6}\s+(.+)$/gm;
const BOLD = /\*\*([^*\n]+)\*\*/g;
/** Models wrap gids in backticks as inline code; the bubble has no code style, so drop the ticks. */
const CODE = /`([^`\n]+)`/g;

export function inlineMarkdown(source: string): MarkdownSegment[] {
	const text = source.replace(HEADING, '**$1**').replace(CODE, '$1');
	const segments: MarkdownSegment[] = [];
	let last = 0;

	for (const match of text.matchAll(BOLD)) {
		const start = match.index;

		if (start > last) segments.push({ strong: false, text: text.slice(last, start) });
		segments.push({ strong: true, text: match[1] ?? '' });
		last = start + match[0].length;
	}

	if (last < text.length) segments.push({ strong: false, text: text.slice(last) });

	return segments;
}
