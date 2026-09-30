import { createNodeBorderProgram } from '@sigma/node-border';
import { type NodeHoverDrawingFunction } from 'sigma/rendering';
import { type GraphEdgeAttributes, type GraphNodeAttributes } from './buildGraph';

/**
 * The drawing pieces of the neon canvas: the glow program, colour alpha, and the hover label.
 *
 * Sigma blends with `ONE, ONE_MINUS_SRC_ALPHA` — it expects **premultiplied** colours. A plain
 * `#rrggbbaa` is therefore added at full strength, which is why a translucent halo used to burn
 * white where discs overlapped. Every colour handed to sigma goes through `withAlpha` / `glowColor`,
 * which premultiply; `glowColor` also lowers the alpha byte below the colour, so halos add light
 * (the neon look) instead of covering what is behind them.
 *
 * Glow is a disc drawn as four concentric layers by `@sigma/node-border`: three halo rings that fade
 * outwards in the node's own colour, and the node itself. A glowing node is drawn larger by
 * `1 / GLOW_CORE`, so its core keeps the size the priority gave it and the halo is extra.
 */

/** The share of a glowing disc's radius that is the node itself; the rest is halo. */
export const GLOW_CORE = 0.5;

export const GlowNodeProgram = createNodeBorderProgram<GraphNodeAttributes, GraphEdgeAttributes>({
	borders: [
		{ color: { attribute: 'glow3', defaultValue: '#00000000' }, size: { mode: 'relative', value: 0.2 } },
		{ color: { attribute: 'glow2', defaultValue: '#00000000' }, size: { mode: 'relative', value: 0.16 } },
		{ color: { attribute: 'glow1', defaultValue: '#00000000' }, size: { mode: 'relative', value: 0.14 } },
		{ color: { attribute: 'color' }, size: { fill: true } },
	],
});

function channels(color: string): [number, number, number, number] | null {
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(color);

	if (match === null) return null;

	const [, red = '0', green = '0', blue = '0', alpha = 'ff'] = match;

	return [parseInt(red, 16), parseInt(green, 16), parseInt(blue, 16), parseInt(alpha, 16) / 255];
}

function hex(values: readonly number[]): string {
	return `#${values
		.map((value) =>
			Math.round(Math.min(255, Math.max(0, value)))
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`;
}

/**
 * The colour at `alpha` (multiplied into any alpha it already has), premultiplied for sigma.
 * `additive` in 0–1 lowers the alpha byte further, so the colour adds light over what is behind.
 */
export function light(color: string, { additive = 0, alpha }: { additive?: number; alpha: number }): string {
	const parsed = channels(color);

	if (parsed === null) return color;

	const [red, green, blue, own] = parsed;
	const k = Math.min(1, Math.max(0, alpha)) * own;

	return hex([red * k, green * k, blue * k, 255 * k * (1 - additive)]);
}

/** The colour at `alpha`, premultiplied for sigma, covering what is behind it. */
export function withAlpha(color: string, alpha: number): string {
	return light(color, { alpha });
}

/** A halo ring in the node's own colour: premultiplied and half additive. */
export function glowColor(color: string, intensity: number): string {
	return light(color, { additive: 0.5, alpha: intensity });
}

/**
 * Sigma's default hover draws a white box, which is unreadable under a light label on the dark
 * canvas. This one draws the label on a dark pill beside the node.
 */
export function createDrawHover(colors: {
	background: string;
	label: string;
}): NodeHoverDrawingFunction<GraphNodeAttributes, GraphEdgeAttributes> {
	// Sigma's hover drawer signature, not ours: it passes three arguments.
	// eslint-disable-next-line @typescript-eslint/max-params
	return (context, data, settings) => {
		if (typeof data.label !== 'string' || data.label === '') return;

		const { labelFont, labelSize: size } = settings;

		context.font = `600 ${size}px ${labelFont}`;

		const { width } = context.measureText(data.label);
		const { y } = data;
		const x = data.x + data.size + 4;
		const padX = 6;
		const height = size + 8;

		context.fillStyle = colors.background;
		context.beginPath();
		context.roundRect(x - padX, y - height / 2, width + padX * 2, height, 4);
		context.fill();
		context.fillStyle = colors.label;
		context.textBaseline = 'middle';
		context.fillText(data.label, x, y);
		context.textBaseline = 'alphabetic';
	};
}
