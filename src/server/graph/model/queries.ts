import {
	type Analysis,
	type Collector,
	type CollectorsInput,
	type CoverageGap,
	type Flow,
	type FlowInput,
	type NetworkSnapshot,
	type NodeCard,
	type RemovalImpact,
} from '@server/graph/model/graph.schema';
import 'server-only';

type Direction = FlowInput['direction'];

function adjacentGid(edge: Analysis['edges'][number], direction: Direction): string {
	return direction === 'down' ? edge.dst : edge.src;
}

function incidentEdges(a: Analysis, input: { direction: Direction; gid: string }): Analysis['edges'] {
	return a.edges.filter((edge) => (input.direction === 'down' ? edge.src === input.gid : edge.dst === input.gid));
}

function reachableHops(
	a: Analysis,
	input: { direction: Direction; gid: string; maxHops: number },
): Map<string, number> {
	const hops = new Map<string, number>([[input.gid, 0]]);
	let frontier = [input.gid];

	for (let hop = 1; hop <= input.maxHops && frontier.length > 0; hop += 1) {
		const next = new Set<string>();

		for (const current of frontier) {
			for (const edge of incidentEdges(a, { direction: input.direction, gid: current })) {
				const adjacent = adjacentGid(edge, input.direction);

				if (!hops.has(adjacent)) {
					hops.set(adjacent, hop);
					next.add(adjacent);
				}
			}
		}

		frontier = [...next];
	}

	return hops;
}

function weakSnapshot(a: Analysis, removed: Set<string>): NetworkSnapshot {
	const remaining = a.nodes.filter((node) => !removed.has(node.gid));
	const remainingGids = new Set(remaining.map((node) => node.gid));
	const neighbours = new Map(remaining.map((node) => [node.gid, new Set<string>()]));

	for (const edge of a.edges) {
		if (remainingGids.has(edge.src) && remainingGids.has(edge.dst)) {
			neighbours.get(edge.src)?.add(edge.dst);
			neighbours.get(edge.dst)?.add(edge.src);
		}
	}

	const seedGids = new Set(remaining.filter((node) => node.isSeed).map((node) => node.gid));
	const unseen = new Set(remainingGids);
	const components: { seeds: number; size: number }[] = [];

	while (unseen.size > 0) {
		const start = unseen.values().next().value!;
		const stack = [start];
		let seeds = 0;
		let size = 0;
		unseen.delete(start);

		while (stack.length > 0) {
			const current = stack.pop()!;

			size += 1;
			if (seedGids.has(current)) seeds += 1;

			for (const neighbour of neighbours.get(current) ?? []) {
				if (unseen.delete(neighbour)) stack.push(neighbour);
			}
		}

		components.push({ seeds, size });
	}

	components.sort((left, right) => right.size - left.size || right.seeds - left.seeds);
	const largest = components[0];

	return {
		components: components.length,
		largest: largest?.size ?? 0,
		seedsInLargest: largest?.seeds ?? 0,
	};
}

/** Return the node and its five largest observed incoming and outgoing counterparties. */

export function nodeCard(a: Analysis, gid: string): NodeCard | null {
	const node = a.nodes.find((candidate) => candidate.gid === gid);

	if (node === undefined) return null;

	const roleOf = new Map(a.nodes.map((candidate) => [candidate.gid, candidate.role]));
	const top = (edges: Analysis['edges'], pick: (edge: Analysis['edges'][number]) => string) =>
		[...edges]
			.sort((left, right) => right.sumKzt - left.sumKzt || pick(left).localeCompare(pick(right)))
			.slice(0, 5)
			.map((edge) => ({
				gid: pick(edge),
				nTx: edge.nTx,
				role: roleOf.get(pick(edge)) ?? 'peripheral',
				sumKzt: edge.sumKzt,
			}));

	return {
		node,
		topIn: top(
			a.edges.filter((edge) => edge.dst === gid),
			(edge) => edge.src,
		),
		topOut: top(
			a.edges.filter((edge) => edge.src === gid),
			(edge) => edge.dst,
		),
	};
}

/** Find downstream nodes reached from at least two supplied sources. */
export function findCollectors(a: Analysis, input: CollectorsInput): Collector[] {
	const roleOf = new Map(a.nodes.map((node) => [node.gid, node.role]));
	const sourcesByCollector = new Map<string, Set<string>>();
	const edgesByCollector = new Map<string, Set<Analysis['edges'][number]>>();
	const requested = new Set(input.gids);

	for (const source of requested) {
		const hops = reachableHops(a, { direction: 'down', gid: source, maxHops: input.maxHops });

		for (const [gid, hop] of hops) {
			if (hop > 0 && !requested.has(gid)) {
				const predecessors = a.edges.filter(
					(edge) => edge.dst === gid && (hops.get(edge.src) ?? Number.POSITIVE_INFINITY) < hop,
				);
				sourcesByCollector.set(gid, new Set([...(sourcesByCollector.get(gid) ?? []), source]));
				edgesByCollector.set(gid, new Set([...(edgesByCollector.get(gid) ?? []), ...predecessors]));
			}
		}
	}

	return [...sourcesByCollector.entries()]
		.filter(([, sources]) => sources.size >= 2)
		.map(([gid, sources]) => ({
			gid,
			kztFromSources: [...(edgesByCollector.get(gid) ?? [])].reduce((sum, edge) => sum + edge.sumKzt, 0),
			reachedFrom: sources.size,
			role: roleOf.get(gid) ?? 'peripheral',
			sources: [...sources].sort((left, right) => left.localeCompare(right)),
		}))
		.sort(
			(left, right) =>
				right.reachedFrom - left.reachedFrom ||
				right.kztFromSources - left.kztFromSources ||
				left.gid.localeCompare(right.gid),
		);
}

/** Return the directed neighbourhood within the requested hop limit. */
export function traceFlow(a: Analysis, input: FlowInput): Flow {
	if (!a.nodes.some((node) => node.gid === input.gid)) return { ...input, edges: [], nodes: [] };

	const hops = reachableHops(a, input);
	const roles = new Map(a.nodes.map((node) => [node.gid, node.role]));
	const edges = a.edges.filter((edge) => {
		const from = input.direction === 'down' ? edge.src : edge.dst;
		const to = input.direction === 'down' ? edge.dst : edge.src;
		const fromHop = hops.get(from);
		const toHop = hops.get(to);

		return fromHop !== undefined && toHop !== undefined && fromHop < input.maxHops && toHop === fromHop + 1;
	});
	const nodes = [...hops.entries()]
		.map(([gid, hop]) => ({ gid, hop, role: roles.get(gid) ?? 'peripheral' }))
		.sort((left, right) => left.hop - right.hop || left.gid.localeCompare(right.gid));

	return { ...input, edges, nodes };
}

/** Compare weak connectivity before and after removing the requested nodes. */
export function simulateRemoval(a: Analysis, gids: string[]): RemovalImpact {
	const removed = [...new Set(gids)];

	return {
		after: weakSnapshot(a, new Set(removed)),
		before: weakSnapshot(a, new Set()),
		removed,
	};
}

/** Explain the main observation limits and the next data request that would reduce each one. */
export function coverageGaps(a: Analysis): CoverageGap[] {
	const truncated = a.nodes.filter((node) => node.truncated).length;
	const seeds = a.nodes.filter((node) => node.isSeed).length;
	const period = `${a.stats.periodFrom}–${a.stats.periodTo}`;

	return [
		{
			affectedNodes: truncated,
			gap: `У ${truncated} узлов обход остановлен на 4-м колене, поэтому продолжение исходящего потока неизвестно.`,
			nextRequest: 'Запросить ещё одно колено исходящих переводов для усечённых узлов.',
		},
		{
			affectedNodes: seeds,
			gap: `Для ${seeds} исходных клиентов входящие переводы до начала обхода представлены неполно.`,
			nextRequest: 'Запросить полную входящую историю исходных клиентов за тот же период.',
		},
		{
			affectedNodes: a.nodes.length,
			gap: `Наблюдение ограничено периодом ${period}; устойчивость выявленных ролей во времени не проверена.`,
			nextRequest: 'Запросить переводы минимум за три предыдущих и три последующих месяца.',
		},
	];
}
