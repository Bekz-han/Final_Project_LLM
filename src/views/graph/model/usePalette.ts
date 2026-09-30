import { type Role, ROLES } from '@server/graph/model/graph.schema';
import { useEffect, useState } from 'react';
import { CLUSTER_PALETTE_SIZE } from './roles';

/**
 * The design tokens sigma needs, resolved to concrete colours. The canvas is dark in both themes, so
 * it reads its own `--color-graph-*` tokens rather than the page's foreground and role chips.
 *
 * Sigma paints on WebGL and cannot read `var(--color-role-transit)`, so the tokens are read off the
 * document with `getComputedStyle` — which substitutes the `var()` chain, so a token defined as
 * another token still arrives as a hex. The colours themselves live only in `globals.css`, and a
 * theme switch re-reads them: the toggle flips `data-theme` on `<html>`, the system preference
 * flips the media query, and either one repaints the graph.
 *
 * Only ever called in the browser: the canvas is loaded with `ssr: false`.
 */
export interface GraphPalette {
	clusters: readonly string[];
	dim: string;
	edge: string;
	edgeFocus: string;
	label: string;
	/** The ground behind the hover label, so it reads on the dark canvas. */
	labelBackground: string;
	roles: Record<Role, string>;
}

function readPalette(): GraphPalette {
	const style = getComputedStyle(document.documentElement);
	const read = (name: string) => style.getPropertyValue(name).trim();

	return {
		clusters: Array.from({ length: CLUSTER_PALETTE_SIZE }, (_slot, i) => read(`--color-graph-cluster-${i + 1}`)),
		dim: read('--color-graph-dim'),
		edge: read('--color-graph-edge'),
		edgeFocus: read('--color-graph-edge-focus'),
		label: read('--color-graph-label'),
		labelBackground: read('--color-graph-label-bg'),
		roles: Object.fromEntries(ROLES.map((role) => [role, read(`--color-graph-role-${role}`)])) as Record<
			Role,
			string
		>,
	};
}

export function usePalette(): GraphPalette {
	const [palette, setPalette] = useState(readPalette);

	useEffect(() => {
		const refresh = () => setPalette(readPalette());
		const observer = new MutationObserver(refresh);
		const media = window.matchMedia('(prefers-color-scheme: dark)');

		observer.observe(document.documentElement, { attributeFilter: ['data-theme'], attributes: true });
		media.addEventListener('change', refresh);

		return () => {
			observer.disconnect();
			media.removeEventListener('change', refresh);
		};
	}, []);

	return palette;
}
