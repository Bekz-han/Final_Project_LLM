'use client';

import { SigmaContainer, useRegisterEvents, useSetSettings, useSigma } from '@react-sigma/core';
import { type Analysis, type Role } from '@server/graph/model/graph.schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Settings } from 'sigma/settings';
import { buildGraph, type GraphEdgeAttributes, type GraphNodeAttributes, type MoneyGraph } from '../model/buildGraph';
import { createDrawHover, GLOW_CORE, glowColor, GlowNodeProgram, light, withAlpha } from '../model/canvasStyle';
import { type MoneyPathView, pathEdgeKey } from '../model/canvasTypes';
import { type ColorMode, type Focus } from '../model/focus';
import { clusterSlot } from '../model/roles';
import { type GraphPalette, usePalette } from '../model/usePalette';

/**
 * The network, drawn by sigma on WebGL.
 *
 * This module touches `window` and WebGL on import, so it is only ever loaded through
 * `next/dynamic` with `ssr: false` — see `GraphScreen`. A WebGL failure throws out of sigma's
 * constructor inside an effect, which the error boundary around it catches.
 *
 * Settings passed to `SigmaContainer` are compared deeply and a change **recreates sigma**, so they
 * are a constant here. Everything that changes — colours, focus, the highlighted cluster — goes
 * through `useSetSettings` as reducers, which repaint without rebuilding.
 *
 * The look is a night sky: the canvas is dark in both themes, the top of the priority list glows in
 * its role colour, edges are straight streams in their sender's colour, and the periphery is dust
 * (hidden by default; still drawn when it is part of a focused neighbourhood or a money path).
 * One "active set" decides what is lit — the money path if there is one, else the hovered node's
 * neighbourhood, else the focused node's, else the highlighted cluster — and everything outside it
 * recedes.
 */

export interface GraphCanvasProps {
	analysis: Pick<Analysis, 'edges' | 'nodes'>;
	colorMode: ColorMode;
	focus: Focus | null;
	/** Nodes of these roles, and their transfers, are not drawn. */
	hiddenRoles?: ReadonlySet<Role>;
	highlightCluster: number | null;
	onSelectNode: (gid: string) => void;
	/** A money path revealed hop by hop; `null` or absent draws the network as usual. */
	path?: MoneyPathView | null;
}

type CanvasSettings = Partial<Settings<GraphNodeAttributes, GraphEdgeAttributes>>;
type CanvasSigma = ReturnType<typeof useSigma<GraphNodeAttributes, GraphEdgeAttributes>>;

const SETTINGS: CanvasSettings = {
	defaultEdgeType: 'arrow',
	// Two thousand labels are noise. The overview labels only the top of the priority list — sigma's
	// collision grid keeps one label per cell — and zooming in brings the rest.
	labelDensity: 0.25,
	labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
	labelGridCellSize: 160,
	labelRenderedSizeThreshold: 8,
	labelSize: 12,
	labelWeight: '600',
	nodeProgramClasses: { glow: GlowNodeProgram },
	renderEdgeLabels: false,
	zIndex: true,
	// Sigma's default grows nodes by √(zoom), so zooming into the dense core only makes the blob
	// bigger. A flatter curve lets zoom separate the nodes instead.
	zoomToSizeRatioFunction: (ratio) => ratio ** 0.2,
};

/** How many of the focused node's counterparties are labelled: the largest by transfer amount. */
const FOCUS_LABELS = 5;
/** A node that is not in focus shrinks to this share of its size, so it recedes rather than blots. */
const DIM_SIZE = 0.4;
/** The top of the priority list that glows brightest. */
const GLOW_TOP = 20;
/** The overview labels only the very top of the priority list. */
const LABEL_TOP = 8;
/** Peripheral nodes are most of the graph: smaller, so they read as dust around the structure. */
const PERIPHERAL_SIZE = 0.75;
/** Edge alpha by state: faint streams in the overview, bright in the lit neighbourhood. */
const EDGE_ALPHA = { active: 0.8, overview: 0.38, path: 1, peripheral: 0.08 } as const;

const CONTAINER_STYLE = { background: 'transparent', height: '100%', width: '100%' } as const;

/** How close the camera comes to a focused node. Sigma's ratio: smaller is closer. */
const FOCUS_RATIO = 0.35;

function nodeColor(palette: GraphPalette, input: { attributes: GraphNodeAttributes; mode: ColorMode }): string {
	const { attributes, mode } = input;

	return mode === 'role'
		? palette.roles[attributes.role]
		: (palette.clusters[clusterSlot(attributes.clusterId) - 1] ?? palette.dim);
}

/** The focused node's counterparties with the most money through them, in either direction. */
function largestCounterparties(graph: MoneyGraph, focused: string): string[] {
	const amounts = new Map<string, number>();

	for (const { attributes, source, target } of graph.edgeEntries(focused)) {
		const other = source === focused ? target : source;

		amounts.set(other, (amounts.get(other) ?? 0) + attributes.sumKzt);
	}

	return [...amounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, FOCUS_LABELS)
		.map(([node]) => node);
}

/** Halo intensities, inner ring to outer: a soft one for every coloured node, a strong one for the top. */
const GLOW = { soft: [0.42, 0.2, 0.08], strong: [0.7, 0.34, 0.13] } as const;

/** A node drawn with a halo in its own colour; the core keeps its size, the halo is extra. */
function glowing(
	data: GraphNodeAttributes,
	{ color, core, strength = 'strong' }: { color: string; core: number; strength?: keyof typeof GLOW },
) {
	const [inner, middle, outer] = GLOW[strength];

	return {
		...data,
		color,
		glow1: glowColor(color, inner),
		glow2: glowColor(color, middle),
		glow3: glowColor(color, outer),
		size: core / GLOW_CORE,
		type: 'glow',
	};
}

/** Top of the list glows strongly, the rest of the coloured nodes softly, the periphery not at all. */
function lit(data: GraphNodeAttributes, color: string) {
	if (data.role === 'peripheral') return { ...data, color };

	return glowing(data, { color, core: data.size, strength: data.rank < GLOW_TOP ? 'strong' : 'soft' });
}

/** Fly the camera to fit a set of nodes. */
function fitCamera(sigma: CanvasSigma, { duration, nodes }: { duration: number; nodes: readonly string[] }) {
	sigma.refresh();

	const points = nodes.map((node) => sigma.getNodeDisplayData(node)).filter((point) => point !== undefined);

	if (points.length === 0) return;

	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const x = (Math.min(...xs) + Math.max(...xs)) / 2;
	const y = (Math.min(...ys) + Math.max(...ys)) / 2;
	const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

	// Normalised coordinates span 0–1 at ratio 1; a box of side s fits at about 1.3s with a margin.
	void sigma.getCamera().animate({ ratio: Math.min(1, Math.max(0.12, spread * 1.3)), x, y }, { duration });
}

function Controller({
	colorMode,
	focus,
	hiddenRoles,
	highlightCluster,
	onSelectNode,
	path,
}: Omit<GraphCanvasProps, 'analysis'>) {
	const sigma = useSigma<GraphNodeAttributes, GraphEdgeAttributes>();
	const setSettings = useSetSettings<GraphNodeAttributes, GraphEdgeAttributes>();
	const registerEvents = useRegisterEvents<GraphNodeAttributes, GraphEdgeAttributes>();
	const palette = usePalette();
	// The latest handler, read at click time, so re-rendering the screen never re-registers events.
	const onSelect = useRef(onSelectNode);
	const [hovered, setHovered] = useState<string | null>(null);
	const focusedGid = focus?.gid ?? null;
	const activePath = path ?? null;

	useEffect(() => {
		onSelect.current = onSelectNode;
	}, [onSelectNode]);

	useEffect(() => {
		const container = sigma.getContainer();

		registerEvents({
			clickNode: (event) => onSelect.current(event.node),
			enterNode: (event) => {
				container.style.cursor = 'pointer';
				setHovered(event.node);
			},
			leaveNode: () => {
				container.style.cursor = '';
				setHovered(null);
			},
		});
	}, [registerEvents, sigma]);

	useEffect(() => {
		const graph = sigma.getGraph();
		const focused = focusedGid !== null && graph.hasNode(focusedGid) ? focusedGid : null;
		const hover = activePath === null && hovered !== null && graph.hasNode(hovered) ? hovered : null;
		// Hover is a temporary focus: it lights its own neighbourhood and moves no camera.
		const centre = hover ?? focused;
		const neighbours = new Set(centre === null ? [] : graph.neighbors(centre));
		const labelled = new Set(centre === null ? [] : largestCounterparties(graph, centre));
		const inCluster = (node: string) => graph.getNodeAttribute(node, 'clusterId') === highlightCluster;
		const revealed = (node: string) => {
			const hop = activePath?.hops.get(node);

			return activePath !== null && hop !== undefined && hop <= activePath.revealedHop;
		};
		// Hidden roles hide only the context: a node in the focused neighbourhood or on the money path is
		// drawn whatever its role, or a peripheral counterparty would vanish from under its own card.
		const inFocus = (node: string) =>
			activePath === null ? node === centre || node === focused || neighbours.has(node) : revealed(node);
		const isHidden = (node: string) =>
			(hiddenRoles?.has(graph.getNodeAttribute(node, 'role')) ?? false) && !inFocus(node);
		const sourceColor = (node: string) =>
			nodeColor(palette, { attributes: graph.getNodeAttributes(node), mode: colorMode });

		setSettings({
			defaultDrawNodeHover: createDrawHover({ background: palette.labelBackground, label: palette.label }),
			edgeReducer: (edge, data) => {
				const source = graph.source(edge);
				const target = graph.target(edge);

				const color = sourceColor(source);

				if (activePath === null && centre === null && (isHidden(source) || isHidden(target))) {
					return { ...data, hidden: true };
				}

				if (activePath !== null) {
					const onPath = activePath.edges.has(pathEdgeKey(source, target)) && revealed(source) && revealed(target);

					return onPath
						? {
								...data,
								color: light(color, { additive: 0.2, alpha: EDGE_ALPHA.path }),
								size: data.size * 2 + 1.5,
								zIndex: 2,
							}
						: { ...data, hidden: true };
				}

				if (centre !== null) {
					return source === centre || target === centre
						? {
								...data,
								color: light(color, { additive: 0.3, alpha: EDGE_ALPHA.active }),
								size: data.size * 1.6 + 0.4,
								zIndex: 1,
							}
						: { ...data, hidden: true };
				}

				if (highlightCluster !== null) {
					return inCluster(source) && inCluster(target)
						? { ...data, color: light(color, { additive: 0.3, alpha: EDGE_ALPHA.active }), zIndex: 1 }
						: { ...data, hidden: true };
				}

				const peripheral = graph.getNodeAttribute(source, 'role') === 'peripheral';

				return {
					...data,
					color: light(color, { additive: 0.5, alpha: peripheral ? EDGE_ALPHA.peripheral : EDGE_ALPHA.overview }),
					size: data.size,
				};
			},
			labelColor: { color: palette.label },
			nodeReducer: (node, data) => {
				if (isHidden(node)) return { ...data, hidden: true };

				const color = nodeColor(palette, { attributes: data, mode: colorMode });
				const dimmed = {
					...data,
					color: withAlpha(palette.dim, 1),
					label: null,
					size: data.size * DIM_SIZE,
					zIndex: 0,
				};
				// The hovered node shows its whole gid; everywhere else the canvas prints the short one.
				const shown = node === hovered ? { forceLabel: true, label: node, zIndex: 4 } : null;

				if (activePath !== null) {
					if (!revealed(node)) return { ...dimmed, ...shown };

					const isTarget = activePath.hops.get(node) === 0;
					const core = Math.max(data.size, isTarget ? 9 : 5.5);

					return { ...glowing(data, { color, core }), forceLabel: true, zIndex: isTarget ? 3 : 2, ...shown };
				}

				if (centre !== null) {
					// Larger rather than `highlighted`: sigma's highlight draws a white label box that is
					// unreadable under the canvas's light label colour.
					if (node === centre) {
						const core = Math.min(Math.max(data.size * 1.2, 8), 11);

						return { ...glowing(data, { color, core }), forceLabel: true, zIndex: 3, ...shown };
					}
					if (neighbours.has(node)) {
						return { ...lit(data, color), forceLabel: labelled.has(node), zIndex: 2, ...shown };
					}
					// While hovering elsewhere, the focused node stays visible so the user keeps their place.
					if (node === focused) return { ...glowing(data, { color, core: data.size }), zIndex: 1 };

					return dimmed;
				}

				if (highlightCluster !== null) {
					if (data.clusterId !== highlightCluster) return dimmed;

					return { ...lit(data, color), zIndex: 1, ...shown };
				}

				// The overview names only the very top; the rest have their gid on hover.
				const label = data.rank < LABEL_TOP ? { forceLabel: true } : { label: null };

				if (data.role === 'peripheral') {
					return {
						...data,
						color: withAlpha(color, 0.7),
						size: data.size * PERIPHERAL_SIZE,
						zIndex: 0,
						...label,
						...shown,
					};
				}

				return { ...lit(data, color), zIndex: data.rank < GLOW_TOP ? 2 : 1, ...label, ...shown };
			},
		});
	}, [activePath, colorMode, focusedGid, hiddenRoles, highlightCluster, hovered, palette, setSettings, sigma]);

	useEffect(() => {
		if (focus === null || !sigma.getGraph().hasNode(focus.gid)) return;

		// The settings effect above has just swapped the reducers, and sigma only schedules the
		// re-processing: until it runs, the display cache holds the node's raw graph coordinates
		// rather than the normalised ones the camera works in, and the camera flies off into empty
		// space. A synchronous refresh first makes the cache current.
		sigma.refresh();

		const target = sigma.getNodeDisplayData(focus.gid);
		const camera = sigma.getCamera();

		if (target !== undefined) {
			void camera.animate(
				{ ratio: Math.min(camera.getState().ratio, FOCUS_RATIO), x: target.x, y: target.y },
				{ duration: 600 },
			);
		}
	}, [focus, sigma]);

	useEffect(() => {
		if (activePath === null) return;

		const graph = sigma.getGraph();
		const shown = [...activePath.hops.entries()]
			.filter(([node, hop]) => hop <= activePath.revealedHop && graph.hasNode(node))
			.map(([node]) => node);

		fitCamera(sigma, { duration: 500, nodes: shown });
	}, [activePath, sigma]);

	useEffect(() => {
		if (activePath !== null) return;

		const camera = sigma.getCamera();

		if (highlightCluster === null) {
			// Nothing in focus any more: show the whole network again.
			if (focusedGid === null) void camera.animatedReset({ duration: 400 });

			return;
		}

		sigma.refresh();

		const points = sigma
			.getGraph()
			.filterNodes((_node, attributes) => attributes.clusterId === highlightCluster)
			.map((node) => sigma.getNodeDisplayData(node))
			.filter((point) => point !== undefined);

		if (points.length === 0) return;

		const x = points.reduce((acc, point) => acc + point.x, 0) / points.length;
		const y = points.reduce((acc, point) => acc + point.y, 0) / points.length;
		const spread = Math.max(...points.map((point) => Math.hypot(point.x - x, point.y - y)));

		// Normalised coordinates span 0–1 at ratio 1, so a cluster of radius r fits at about 2.4r.
		void camera.animate({ ratio: Math.min(1, Math.max(0.15, spread * 2.4)), x, y }, { duration: 600 });
	}, [activePath, focusedGid, highlightCluster, sigma]);

	return null;
}

export function GraphCanvas({ analysis, ...props }: GraphCanvasProps) {
	const graph = useMemo(() => buildGraph(analysis), [analysis]);

	return (
		<SigmaContainer<GraphNodeAttributes, GraphEdgeAttributes>
			// react-sigma's own stylesheet is not imported — it hard-codes white grounds on :root — so
			// the one rule that matters from it is here: sigma refuses a container with no height.
			className="[&_.sigma-container]:h-full [&_.sigma-container]:w-full [&_.sigma-nodes]:[filter:saturate(1.3)_drop-shadow(0_0_5px_rgb(255_255_255/0.18))]"
			graph={graph}
			settings={SETTINGS}
			style={CONTAINER_STYLE}
		>
			<Controller {...props} />
		</SigmaContainer>
	);
}
