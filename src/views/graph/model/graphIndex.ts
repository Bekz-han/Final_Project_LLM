import { type Analysis, type Counterparty, type EdgeRow, type NodeRow } from '@server/graph/model/graph.schema';

/**
 * Lookups the screen makes on every click, built once per analysis.
 *
 * The node card needs a node by gid and its biggest counterparties in both directions. Scanning
 * 3 119 edges per click is fast enough; building the index once is simpler to reason about and
 * makes the search box an O(1) lookup.
 */
export interface GraphIndex {
	incoming: ReadonlyMap<string, readonly EdgeRow[]>;
	nodes: ReadonlyMap<string, NodeRow>;
	outgoing: ReadonlyMap<string, readonly EdgeRow[]>;
}

function push(map: Map<string, EdgeRow[]>, edge: { key: string; row: EdgeRow }): void {
	const list = map.get(edge.key);

	if (list === undefined) map.set(edge.key, [edge.row]);
	else list.push(edge.row);
}

export function buildIndex(analysis: Pick<Analysis, 'edges' | 'nodes'>): GraphIndex {
	const incoming = new Map<string, EdgeRow[]>();
	const outgoing = new Map<string, EdgeRow[]>();

	for (const row of analysis.edges) {
		push(outgoing, { key: row.src, row });
		push(incoming, { key: row.dst, row });
	}

	return { incoming, nodes: new Map(analysis.nodes.map((node) => [node.gid, node])), outgoing };
}

export const COUNTERPARTY_LIMIT = 5;

/**
 * The largest senders to and receivers from a node, by KZT, at most five each.
 *
 * The same shape as the server's `NodeCard`, computed here because a view may not import the
 * server's model functions — only its schema.
 */
export function counterparties(index: GraphIndex, gid: string): { topIn: Counterparty[]; topOut: Counterparty[] } {
	const toCounterparty = (row: EdgeRow, other: string): Counterparty => ({
		gid: other,
		nTx: row.nTx,
		role: index.nodes.get(other)?.role ?? 'peripheral',
		sumKzt: row.sumKzt,
	});
	const top = (rows: readonly EdgeRow[] | undefined, pick: (row: EdgeRow) => string) =>
		[...(rows ?? [])]
			.sort((a, b) => b.sumKzt - a.sumKzt)
			.slice(0, COUNTERPARTY_LIMIT)
			.map((row) => toCounterparty(row, pick(row)));

	return {
		topIn: top(index.incoming.get(gid), (row) => row.src),
		topOut: top(index.outgoing.get(gid), (row) => row.dst),
	};
}

/**
 * What a person typed into the search box, as a gid, or the reason it is not one.
 *
 * Spaces are dropped because a gid copied from a spreadsheet arrives grouped in threes. It stays
 * a string throughout: the values are above `Number.MAX_SAFE_INTEGER`.
 */
export type GidLookup = { gid: string; kind: 'found' } | { kind: 'invalid' } | { kind: 'missing'; query: string };

export function lookupGid(index: GraphIndex, raw: string): GidLookup {
	const query = raw.replaceAll(/\s/g, '');

	if (!/^\d+$/.test(query)) return { kind: 'invalid' };
	if (!index.nodes.has(query)) return { kind: 'missing', query };

	return { gid: query, kind: 'found' };
}
