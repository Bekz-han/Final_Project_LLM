import { type Analysis, type Role } from '@server/graph/model/graph.schema';
import { DirectedGraph } from 'graphology';

/**
 * The graphology graph sigma draws, built from the analysis as it is.
 *
 * No layout runs in the browser: the pipeline computed x/y with a fixed seed, so the picture is the
 * same on every machine and every reload, and the jury sees the network the README describes.
 */

// The index signatures are what graphology's `Attributes` constraint asks for; an interface without
// one is not assignable to it.
export interface GraphNodeAttributes {
	[key: string]: unknown;
	clusterId: number;
	label: string;
	/** Place on the priority list, 0 first. The top of it glows on the canvas. */
	rank: number;
	role: Role;
	size: number;
	x: number;
	y: number;
}

export interface GraphEdgeAttributes {
	[key: string]: unknown;
	size: number;
	/** The transfer amount, so a focused node labels its largest counterparties first. */
	sumKzt: number;
	type: 'arrow';
}

export type MoneyGraph = DirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>;

/** Pixels at the default zoom. The top of the priority list must stand out from two thousand dots. */
export const NODE_SIZE = { max: 15, min: 1.2 } as const;
export const EDGE_SIZE = { max: 1.6, min: 0.3 } as const;

/**
 * Non-linear on purpose: on a straight line two thousand mid-priority nodes are all medium discs and
 * overlap into one blob. The power curve keeps most of them dots and lets the top stand out.
 */
const SIZE_CURVE = 4.5;

export function nodeSize(priorityScore: number): number {
	const score = Math.min(1, Math.max(0, priorityScore));

	return NODE_SIZE.min + (NODE_SIZE.max - NODE_SIZE.min) * score ** SIZE_CURVE;
}

/**
 * What the canvas prints beside a node: the last six digits. Eighteen-digit gids beside a dozen
 * neighbours overlap into an unreadable pile; the full gid is on hover, in the card and the search.
 */
export function shortGid(gid: string): string {
	return gid.length > 6 ? `…${gid.slice(-6)}` : gid;
}

/** Transfers span 7k to 3M KZT, so thickness follows the logarithm or the graph is all hairlines. */
function edgeSizer(amounts: readonly number[]): (sumKzt: number) => number {
	const logs = amounts.map((amount) => Math.log10(amount + 1));
	const low = Math.min(...logs);
	const span = Math.max(...logs) - low;

	return (sumKzt) => {
		if (span <= 0) return (EDGE_SIZE.min + EDGE_SIZE.max) / 2;

		return EDGE_SIZE.min + ((EDGE_SIZE.max - EDGE_SIZE.min) * (Math.log10(sumKzt + 1) - low)) / span;
	};
}

export function buildGraph(analysis: Pick<Analysis, 'edges' | 'nodes'>): MoneyGraph {
	const graph: MoneyGraph = new DirectedGraph();
	// Scores are relative: the top of this run tops out well under 1, and the largest disc belongs to
	// whoever is first on the list, not to a score nobody reached.
	const topScore = Math.max(0, ...analysis.nodes.map((node) => node.priorityScore));
	const relative = (score: number) => (topScore > 0 ? score / topScore : 0);
	const ranks = new Map(
		[...analysis.nodes].sort((a, b) => b.priorityScore - a.priorityScore).map((node, rank) => [node.gid, rank]),
	);

	for (const node of analysis.nodes) {
		graph.mergeNode(node.gid, {
			clusterId: node.clusterId,
			label: shortGid(node.gid),
			rank: ranks.get(node.gid) ?? analysis.nodes.length,
			role: node.role,
			size: nodeSize(relative(node.priorityScore)),
			x: node.x,
			y: node.y,
		});
	}

	const sizeOf = edgeSizer(analysis.edges.map((edge) => edge.sumKzt));

	for (const edge of analysis.edges) {
		// An edge to a node that is not in the list would make graphology invent a node with no
		// position, and sigma refuses to render one. Skip it rather than lose the whole picture.
		if (graph.hasNode(edge.src) && graph.hasNode(edge.dst)) {
			graph.mergeEdge(edge.src, edge.dst, { size: sizeOf(edge.sumKzt), sumKzt: edge.sumKzt, type: 'arrow' });
		}
	}

	return graph;
}
