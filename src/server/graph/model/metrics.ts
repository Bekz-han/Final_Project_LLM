import { type NodeMetrics, type RawGraph } from '@server/graph/model/graph.schema';
import 'server-only';

const DAMPING = 0.85;
const MAX_ITERATIONS = 1_000;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1_000;
const TOLERANCE = 1e-12;

type Adjacency = Map<string, Map<string, number>>;

function buildAdjacency(raw: RawGraph): Adjacency {
	const adjacency: Adjacency = new Map(raw.nodes.map((node) => [node.gid, new Map()]));

	for (const edge of raw.edges) {
		const neighbours = adjacency.get(edge.src);
		if (neighbours !== undefined && adjacency.has(edge.dst)) {
			neighbours.set(edge.dst, (neighbours.get(edge.dst) ?? 0) + edge.sumKzt);
		}
	}

	return adjacency;
}

function computePageRank(adjacency: Adjacency): Map<string, number> {
	const gids = [...adjacency.keys()];
	const size = gids.length;
	if (size === 0) return new Map();

	let ranks = new Map(gids.map((gid) => [gid, 1 / size]));

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		let danglingMass = 0;
		for (const gid of gids) {
			if ((adjacency.get(gid)?.size ?? 0) === 0) danglingMass += ranks.get(gid) ?? 0;
		}
		const base = (1 - DAMPING) / size + (DAMPING * danglingMass) / size;
		const next = new Map(gids.map((gid) => [gid, base]));

		for (const src of gids) {
			const outgoing = adjacency.get(src)!;
			const totalWeight = [...outgoing.values()].reduce((sum, weight) => sum + weight, 0);
			if (totalWeight > 0) {
				for (const [dst, weight] of outgoing) {
					next.set(dst, (next.get(dst) ?? 0) + (DAMPING * (ranks.get(src) ?? 0) * weight) / totalWeight);
				}
			}
		}

		let error = 0;
		for (const gid of gids) error += Math.abs((next.get(gid) ?? 0) - (ranks.get(gid) ?? 0));
		ranks = next;
		if (error < size * TOLERANCE) break;
	}

	return ranks;
}

function computeHits(adjacency: Adjacency): { authorities: Map<string, number>; hubs: Map<string, number> } {
	const gids = [...adjacency.keys()];
	if (gids.length === 0) return { authorities: new Map(), hubs: new Map() };

	let hubs = new Map(gids.map((gid) => [gid, 1 / Math.sqrt(gids.length)]));
	let authorities = new Map(gids.map((gid) => [gid, 0]));

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		const nextAuthorities = new Map(gids.map((gid) => [gid, 0]));
		for (const [src, outgoing] of adjacency) {
			for (const dst of outgoing.keys()) {
				nextAuthorities.set(dst, (nextAuthorities.get(dst) ?? 0) + (hubs.get(src) ?? 0));
			}
		}

		const authorityNorm = Math.hypot(...nextAuthorities.values());
		if (authorityNorm > 0) {
			for (const gid of gids) nextAuthorities.set(gid, (nextAuthorities.get(gid) ?? 0) / authorityNorm);
		}

		const nextHubs = new Map(gids.map((gid) => [gid, 0]));
		for (const [src, outgoing] of adjacency) {
			for (const dst of outgoing.keys()) {
				nextHubs.set(src, (nextHubs.get(src) ?? 0) + (nextAuthorities.get(dst) ?? 0));
			}
		}

		const hubNorm = Math.hypot(...nextHubs.values());
		if (hubNorm > 0) {
			for (const gid of gids) nextHubs.set(gid, (nextHubs.get(gid) ?? 0) / hubNorm);
		}

		let error = 0;
		for (const gid of gids) {
			error += Math.abs((nextAuthorities.get(gid) ?? 0) - (authorities.get(gid) ?? 0));
			error += Math.abs((nextHubs.get(gid) ?? 0) - (hubs.get(gid) ?? 0));
		}
		authorities = nextAuthorities;
		hubs = nextHubs;
		if (error < gids.length * TOLERANCE) break;
	}

	const authoritySum = [...authorities.values()].reduce((sum, value) => sum + value, 0);
	const hubSum = [...hubs.values()].reduce((sum, value) => sum + value, 0);
	if (authoritySum > 0) {
		for (const gid of gids) authorities.set(gid, (authorities.get(gid) ?? 0) / authoritySum);
	}
	if (hubSum > 0) {
		for (const gid of gids) hubs.set(gid, (hubs.get(gid) ?? 0) / hubSum);
	}

	return { authorities, hubs };
}

function computeBetweenness(adjacency: Adjacency): Map<string, number> {
	const gids = [...adjacency.keys()];
	const scores = new Map(gids.map((gid) => [gid, 0]));

	for (const source of gids) {
		const stack: string[] = [];
		const predecessors = new Map(gids.map((gid) => [gid, [] as string[]]));
		const pathCounts = new Map(gids.map((gid) => [gid, 0]));
		const distances = new Map(gids.map((gid) => [gid, -1]));
		pathCounts.set(source, 1);
		distances.set(source, 0);
		const queue = [source];

		for (const current of queue) {
			stack.push(current);
			for (const neighbour of adjacency.get(current)?.keys() ?? []) {
				if ((distances.get(neighbour) ?? -1) < 0) {
					queue.push(neighbour);
					distances.set(neighbour, (distances.get(current) ?? 0) + 1);
				}
				if (distances.get(neighbour) === (distances.get(current) ?? 0) + 1) {
					pathCounts.set(neighbour, (pathCounts.get(neighbour) ?? 0) + (pathCounts.get(current) ?? 0));
					predecessors.get(neighbour)!.push(current);
				}
			}
		}

		const dependencies = new Map(gids.map((gid) => [gid, 0]));
		while (stack.length > 0) {
			const target = stack.pop()!;
			for (const predecessor of predecessors.get(target) ?? []) {
				const contribution =
					((pathCounts.get(predecessor) ?? 0) / (pathCounts.get(target) ?? 1)) *
					(1 + (dependencies.get(target) ?? 0));
				dependencies.set(predecessor, (dependencies.get(predecessor) ?? 0) + contribution);
			}
			if (target !== source) scores.set(target, (scores.get(target) ?? 0) + (dependencies.get(target) ?? 0));
		}
	}

	const scale = gids.length > 2 ? 1 / ((gids.length - 1) * (gids.length - 2)) : 0;
	for (const gid of gids) scores.set(gid, (scores.get(gid) ?? 0) * scale);
	return scores;
}

function computeSeedsUpstream(raw: RawGraph, adjacency: Adjacency): Map<string, number> {
	const upstream = new Map([...adjacency.keys()].map((gid) => [gid, new Set<string>()]));

	for (const seed of raw.nodes.filter((node) => node.isSeed)) {
		const visited = new Set([seed.gid]);
		const queue = [seed.gid];
		for (const current of queue) {
			if (current !== seed.gid) upstream.get(current)?.add(seed.gid);
			for (const neighbour of adjacency.get(current)?.keys() ?? []) {
				if (!visited.has(neighbour)) {
					visited.add(neighbour);
					queue.push(neighbour);
				}
			}
		}
	}

	return new Map([...upstream].map(([gid, seeds]) => [gid, seeds.size]));
}

function computeFastTransitShares(raw: RawGraph): Map<string, number> {
	const incomingDates = new Map<string, number[]>();
	const outgoing = new Map<string, { amount: number; timestamp: number }[]>();

	for (const transaction of raw.transactions) {
		const timestamp = Date.parse(`${transaction.date}T00:00:00.000Z`);
		const dates = incomingDates.get(transaction.dst) ?? [];
		dates.push(timestamp);
		incomingDates.set(transaction.dst, dates);
		const payments = outgoing.get(transaction.src) ?? [];
		payments.push({ amount: transaction.sumKzt, timestamp });
		outgoing.set(transaction.src, payments);
	}

	const shares = new Map<string, number>();
	for (const node of raw.nodes) {
		const payments = outgoing.get(node.gid) ?? [];
		const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
		const dates = incomingDates.get(node.gid) ?? [];
		const fast = payments.reduce((sum, payment) => {
			const matched = dates.some(
				(incoming) => incoming <= payment.timestamp && payment.timestamp - incoming <= TWO_DAYS_MS,
			);
			return sum + (matched ? payment.amount : 0);
		}, 0);
		shares.set(node.gid, total > 0 ? fast / total : 0);
	}

	return shares;
}

/** Computes structural, centrality, reachability and timing metrics for every input node. */
export function computeMetrics(raw: RawGraph): Map<string, NodeMetrics> {
	const metrics = new Map<string, NodeMetrics>();
	const adjacency = buildAdjacency(raw);

	for (const node of raw.nodes) {
		metrics.set(node.gid, {
			authority: 0,
			betweenness: 0,
			depth: node.depth,
			fastTransitShare: 0,
			gid: node.gid,
			hub: 0,
			inDeg: 0,
			inKzt: 0,
			inTx: 0,
			isSeed: node.isSeed,
			outDeg: adjacency.get(node.gid)?.size ?? 0,
			outKzt: 0,
			outTx: 0,
			pagerank: 0,
			passThrough: null,
			seedsUpstream: 0,
			truncated: false,
		});
	}

	const incomingNeighbours = new Map(raw.nodes.map((node) => [node.gid, new Set<string>()]));
	for (const edge of raw.edges) {
		const src = metrics.get(edge.src);
		const dst = metrics.get(edge.dst);
		if (src !== undefined && dst !== undefined) {
			src.outKzt += edge.sumKzt;
			src.outTx += edge.nTx;
			dst.inKzt += edge.sumKzt;
			dst.inTx += edge.nTx;
			incomingNeighbours.get(edge.dst)?.add(edge.src);
		}
	}

	const pageranks = computePageRank(adjacency);
	const { authorities, hubs } = computeHits(adjacency);
	const betweenness = computeBetweenness(adjacency);
	const seedsUpstream = computeSeedsUpstream(raw, adjacency);
	const fastTransitShares = computeFastTransitShares(raw);

	for (const metric of metrics.values()) {
		metric.authority = authorities.get(metric.gid) ?? 0;
		metric.betweenness = betweenness.get(metric.gid) ?? 0;
		metric.fastTransitShare = fastTransitShares.get(metric.gid) ?? 0;
		metric.hub = hubs.get(metric.gid) ?? 0;
		metric.inDeg = incomingNeighbours.get(metric.gid)?.size ?? 0;
		metric.pagerank = pageranks.get(metric.gid) ?? 0;
		metric.passThrough = metric.inKzt > 0 ? metric.outKzt / metric.inKzt : null;
		metric.seedsUpstream = seedsUpstream.get(metric.gid) ?? 0;
		metric.truncated = metric.depth === 4 && metric.outDeg === 0;
	}

	return metrics;
}
