import { type Analysis, type EdgeRow } from '@server/graph/model/graph.schema';

/**
 * How money from the seeds reached one client, hop by hop.
 *
 * A reverse breadth-first walk from the target along incoming edges (dst → src). Hop 0 is the
 * target, hop 1 its direct senders, and so on. A seed is where the walk stops: it is a source, so
 * its own senders are not the story. To keep the picture readable each node keeps only its
 * strongest senders by KZT, and the whole path is capped in nodes.
 *
 * When at least one seed is reached, everything that does not lead to a seed is pruned, so the
 * canvas shows routes and nothing else. When none is reached the upstream neighbourhood is
 * returned as it is, with `seedsReached` empty — the money may enter from outside the extract.
 *
 * Edges are kept only between consecutive hops (hop h+1 → hop h), which makes the result a
 * layered DAG the canvas can reveal one hop at a time. gids are strings throughout.
 */
export interface MoneyPath {
	/** "src|dst" keys of the edges on the kept paths. */
	edges: Set<string>;
	/** gid → hop; the target is 0. */
	hops: Map<string, number>;
	maxHop: number;
	seedsReached: string[];
	target: string;
	/** Sum of the kept edges into the target, KZT. */
	totalKzt: number;
}

export interface MoneyPathOptions {
	maxEdgesPerHop?: number;
	maxHops?: number;
	maxNodes?: number;
}

const DEFAULT_MAX_HOPS = 4;
const DEFAULT_MAX_EDGES_PER_HOP = 8;
const DEFAULT_MAX_NODES = 60;

export function edgeKey(edge: Pick<EdgeRow, 'dst' | 'src'>): string {
	return `${edge.src}|${edge.dst}`;
}

function incomingByDst(edges: readonly EdgeRow[]): Map<string, EdgeRow[]> {
	const map = new Map<string, EdgeRow[]>();

	for (const edge of edges) {
		const list = map.get(edge.dst);

		if (list === undefined) map.set(edge.dst, [edge]);
		else list.push(edge);
	}

	for (const list of map.values()) list.sort((a, b) => b.sumKzt - a.sumKzt);

	return map;
}

interface Walk {
	hops: Map<string, number>;
	kept: EdgeRow[];
}

function walkUpstream(
	input: { incoming: Map<string, EdgeRow[]>; seeds: ReadonlySet<string>; target: string },
	limits: Required<MoneyPathOptions>,
): Walk {
	const hops = new Map<string, number>([[input.target, 0]]);
	const kept: EdgeRow[] = [];
	let frontier = [input.target];

	for (let hop = 1; hop <= limits.maxHops && frontier.length > 0; hop++) {
		const next: string[] = [];

		// A seed is a source: the walk does not climb past it (unless it is the target itself).
		const climbable = frontier.filter((gid) => !input.seeds.has(gid) || gid === input.target);

		for (const dst of climbable) {
			for (const edge of (input.incoming.get(dst) ?? []).slice(0, limits.maxEdgesPerHop)) {
				if (!hops.has(edge.src) && hops.size < limits.maxNodes) {
					hops.set(edge.src, hop);
					next.push(edge.src);
				}

				if (hops.get(edge.src) === hop) kept.push(edge);
			}
		}

		frontier = next;
	}

	return { hops, kept };
}

/** Keeps only nodes from which a seed is reachable upstream along kept edges, plus the target. */
function pruneToSeeds(walk: Walk, input: { seeds: ReadonlySet<string>; target: string }): Walk {
	const good = new Set<string>();
	const byHopDesc = [...walk.hops.entries()].sort((a, b) => b[1] - a[1]);
	const senders = new Map<string, string[]>();

	for (const edge of walk.kept) {
		const list = senders.get(edge.dst);

		if (list === undefined) senders.set(edge.dst, [edge.src]);
		else list.push(edge.src);
	}

	for (const [gid] of byHopDesc) {
		const isStop = input.seeds.has(gid) && gid !== input.target;

		if (isStop || (senders.get(gid) ?? []).some((src) => good.has(src))) good.add(gid);
	}

	good.add(input.target);

	return {
		hops: new Map([...walk.hops].filter(([gid]) => good.has(gid))),
		kept: walk.kept.filter((edge) => good.has(edge.src) && good.has(edge.dst)),
	};
}

export function buildMoneyPath(
	analysis: Pick<Analysis, 'edges' | 'nodes'>,
	request: MoneyPathOptions & { gid: string },
): MoneyPath | null {
	const { gid: target } = request;

	if (!analysis.nodes.some((node) => node.gid === target)) return null;

	const limits: Required<MoneyPathOptions> = {
		maxEdgesPerHop: request.maxEdgesPerHop ?? DEFAULT_MAX_EDGES_PER_HOP,
		maxHops: request.maxHops ?? DEFAULT_MAX_HOPS,
		maxNodes: request.maxNodes ?? DEFAULT_MAX_NODES,
	};
	const seeds = new Set(analysis.nodes.filter((node) => node.isSeed).map((node) => node.gid));
	const walked = walkUpstream({ incoming: incomingByDst(analysis.edges), seeds, target }, limits);
	const seedsReached = [...walked.hops.keys()].filter((gid) => gid !== target && seeds.has(gid));
	const walk = seedsReached.length > 0 ? pruneToSeeds(walked, { seeds, target }) : walked;

	return {
		edges: new Set(walk.kept.map(edgeKey)),
		hops: walk.hops,
		maxHop: Math.max(...walk.hops.values()),
		seedsReached,
		target,
		totalKzt: walk.kept.filter((edge) => edge.dst === target).reduce((sum, edge) => sum + edge.sumKzt, 0),
	};
}
