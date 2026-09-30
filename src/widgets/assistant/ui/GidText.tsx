import { splitGids } from '../lib/gids';
import { inlineMarkdown } from '../lib/inlineMarkdown';

/**
 * One gid as a link-styled button. A button, not an anchor: it focuses a node on the graph, it
 * does not navigate. Monospace and tabular so a column of gids lines up and reads digit by digit.
 */
export function GidButton({ gid, onGidClick }: { gid: string; onGidClick: (gid: string) => void }) {
	return (
		<button
			className="text-accent-fg hover:bg-accent-subtle rounded-sm font-mono break-all tabular-nums underline decoration-dotted underline-offset-2"
			onClick={() => {
				onGidClick(gid);
			}}
			title="Показать на графе"
			type="button"
		>
			{gid}
		</button>
	);
}

/**
 * Text with every gid in it made clickable — or left as plain text when there is nothing to call.
 * Without `onGidClick` a gid that looks like a link but does nothing would be a small lie.
 */
function Gids({ onGidClick, text }: { onGidClick?: (gid: string) => void; text: string }) {
	if (onGidClick === undefined) return text;

	return splitGids(text).map((segment, index) =>
		segment.kind === 'gid' ? (
			<GidButton gid={segment.gid} key={`${segment.gid}-${String(index)}`} onGidClick={onGidClick} />
		) : (
			<span key={`text-${String(index)}`}>{segment.text}</span>
		),
	);
}

/** Bold and headings from the model's Markdown first, then gids inside each piece. */
export function GidText({ onGidClick, text }: { onGidClick?: (gid: string) => void; text: string }) {
	return inlineMarkdown(text).map((segment, index) => {
		const key = `md-${String(index)}`;

		return segment.strong ? (
			<strong className="font-semibold" key={key}>
				<Gids onGidClick={onGidClick} text={segment.text} />
			</strong>
		) : (
			<span key={key}>
				<Gids onGidClick={onGidClick} text={segment.text} />
			</span>
		);
	});
}
