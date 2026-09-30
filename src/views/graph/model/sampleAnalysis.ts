import {
	type Analysis,
	type ClusterRow,
	type EdgeRow,
	type NodeRow,
	type Role,
	type TopRow,
} from '@server/graph/model/graph.schema';
import { ROLE_LABELS } from './roles';

/**
 * A 26-node stand-in for `output/analysis.json`, so the screen can be built before the pipeline
 * exists. `sampleAnalysis.spec.ts` parses it with `analysisSchema`, so it cannot drift from the
 * contract.
 *
 * Only the shape of each node is written by hand — role, cluster, position, priority. Degrees, sums,
 * pass-through and seeds upstream are derived from the edge list below, so the evidence strings and
 * the node card always agree with the arrows on the canvas.
 *
 * Three clusters: a seed-heavy network collecting into one consolidator (0), a transit chain that
 * runs into the 4th-hop cut-off (1), and a fan-out from one distributor (2). One transit node links
 * cluster 2 into cluster 0's consolidator, which is the kind of bridge the analyst looks for.
 */

const GID_PREFIX = '7704100000000';

/** 18-digit gids, like the real ones: above `Number.MAX_SAFE_INTEGER`, so strings. */
function gid(n: number): string {
	return GID_PREFIX + String(10000 + n * 137).padStart(5, '0');
}

interface NodeSpec {
	cluster: number;
	depth: number;
	n: number;
	priority: number;
	role: Role;
	roleScore: number;
	seed?: true;
	/** Position on a unit circle around the cluster's centre: angle in turns, radius. */
	spot: [number, number];
}

const CENTRES: Record<number, [number, number]> = { 0: [-9, 1], 1: [9, 4], 2: [0, -10] };

const NODES: readonly NodeSpec[] = [
	// Cluster 0 — three seeds feed one consolidator directly and through two transit accounts.
	{ cluster: 0, depth: 0, n: 1, priority: 0.86, role: 'coordinator', roleScore: 0.8, seed: true, spot: [0, 0] },
	{ cluster: 0, depth: 0, n: 2, priority: 0.41, role: 'peripheral', roleScore: 0.3, seed: true, spot: [0.1, 5] },
	{ cluster: 0, depth: 0, n: 3, priority: 0.38, role: 'peripheral', roleScore: 0.3, seed: true, spot: [0.3, 5] },
	{ cluster: 0, depth: 1, n: 4, priority: 0.55, role: 'transit', roleScore: 0.72, spot: [0.18, 3] },
	{ cluster: 0, depth: 1, n: 5, priority: 0.52, role: 'transit', roleScore: 0.66, spot: [0.4, 3] },
	{ cluster: 0, depth: 2, n: 6, priority: 0.94, role: 'consolidator', roleScore: 0.91, spot: [0.25, 1.8] },
	{ cluster: 0, depth: 1, n: 7, priority: 0.71, role: 'distributor', roleScore: 0.74, spot: [0.75, 2.5] },
	{ cluster: 0, depth: 2, n: 8, priority: 0.33, role: 'terminal', roleScore: 0.55, spot: [0.62, 5] },
	{ cluster: 0, depth: 2, n: 9, priority: 0.31, role: 'terminal', roleScore: 0.5, spot: [0.7, 5.5] },
	{ cluster: 0, depth: 2, n: 10, priority: 0.12, role: 'peripheral', roleScore: 0.2, spot: [0.8, 5.5] },
	{ cluster: 0, depth: 2, n: 11, priority: 0.1, role: 'peripheral', roleScore: 0.2, spot: [0.88, 5] },

	// Cluster 1 — a transit chain down to the 4th hop, where the traversal stops.
	{ cluster: 1, depth: 0, n: 12, priority: 0.78, role: 'coordinator', roleScore: 0.7, seed: true, spot: [0, 0] },
	{ cluster: 1, depth: 1, n: 13, priority: 0.58, role: 'transit', roleScore: 0.8, spot: [0.05, 2.5] },
	{ cluster: 1, depth: 2, n: 14, priority: 0.5, role: 'transit', roleScore: 0.62, spot: [0.95, 3] },
	{ cluster: 1, depth: 3, n: 15, priority: 0.81, role: 'consolidator', roleScore: 0.77, spot: [0.9, 5] },
	{ cluster: 1, depth: 1, n: 16, priority: 0.18, role: 'peripheral', roleScore: 0.25, spot: [0.35, 3] },
	{ cluster: 1, depth: 2, n: 17, priority: 0.27, role: 'terminal', roleScore: 0.45, spot: [0.45, 4] },
	{ cluster: 1, depth: 4, n: 18, priority: 0.2, role: 'peripheral', roleScore: 0.2, spot: [0.8, 7] },
	{ cluster: 1, depth: 4, n: 19, priority: 0.47, role: 'consolidator', roleScore: 0.45, spot: [0.97, 7.5] },

	// Cluster 2 — one seed, one distributor, a fan of small receivers, and a bridge into cluster 0.
	{ cluster: 2, depth: 0, n: 20, priority: 0.44, role: 'peripheral', roleScore: 0.3, seed: true, spot: [0, 0] },
	{ cluster: 2, depth: 1, n: 21, priority: 0.69, role: 'distributor', roleScore: 0.81, spot: [0.5, 2] },
	{ cluster: 2, depth: 2, n: 22, priority: 0.24, role: 'terminal', roleScore: 0.4, spot: [0.42, 5] },
	{ cluster: 2, depth: 2, n: 23, priority: 0.22, role: 'terminal', roleScore: 0.4, spot: [0.52, 5.5] },
	{ cluster: 2, depth: 2, n: 24, priority: 0.08, role: 'peripheral', roleScore: 0.15, spot: [0.62, 5] },
	{ cluster: 2, depth: 2, n: 25, priority: 0.06, role: 'peripheral', roleScore: 0.15, spot: [0.7, 4.5] },
	{ cluster: 2, depth: 1, n: 26, priority: 0.6, role: 'transit', roleScore: 0.7, spot: [0.2, 4] },
];

/** [src, dst, sumKzt, nTx, firstDay, lastDay] — days of July 2026. */
type EdgeSpec = [number, number, number, number, number, number];

const EDGES: readonly EdgeSpec[] = [
	[1, 4, 1_450_000, 4, 2, 9],
	[1, 5, 980_000, 3, 3, 11],
	[1, 6, 2_300_000, 5, 1, 20],
	[1, 7, 1_750_000, 4, 4, 14],
	[2, 4, 640_000, 2, 5, 8],
	[2, 6, 870_000, 3, 6, 19],
	[3, 5, 720_000, 2, 7, 12],
	[3, 6, 530_000, 2, 9, 21],
	[4, 6, 1_980_000, 6, 3, 18],
	[5, 6, 1_610_000, 5, 4, 22],
	[6, 11, 90_000, 1, 25, 25],
	[7, 8, 410_000, 2, 6, 15],
	[7, 9, 380_000, 2, 7, 16],
	[7, 10, 120_000, 1, 8, 8],
	[7, 11, 95_000, 1, 9, 9],
	[7, 22, 150_000, 1, 10, 10],
	[12, 13, 1_900_000, 5, 2, 17],
	[12, 16, 60_000, 1, 3, 3],
	[12, 17, 340_000, 2, 5, 13],
	[13, 14, 1_820_000, 5, 3, 19],
	[13, 15, 240_000, 1, 11, 11],
	[14, 15, 1_700_000, 4, 5, 24],
	[16, 15, 45_000, 1, 12, 12],
	[15, 18, 70_000, 1, 26, 26],
	[15, 19, 610_000, 2, 27, 29],
	[14, 19, 150_000, 1, 28, 28],
	[20, 21, 2_100_000, 3, 1, 6],
	[20, 26, 900_000, 2, 2, 7],
	[21, 22, 380_000, 3, 4, 18],
	[21, 23, 360_000, 2, 5, 19],
	[21, 24, 110_000, 1, 6, 6],
	[21, 25, 95_000, 1, 7, 7],
	[21, 17, 280_000, 2, 8, 20],
	[21, 8, 300_000, 2, 9, 21],
	[26, 6, 860_000, 3, 4, 23],
];

const HYPOTHESES: Record<number, string> = {
	0: 'Признаки консолидации: три seed-клиента сводят средства на один счёт напрямую и через два транзитных. Проверить происхождение поступлений консолидатора.',
	1: 'Признаки транзитной цепочки: деньги проходят два колена почти без остатка и уходят за 4-е колено, где обход остановлен. Запросить продолжение выписки.',
	2: 'Признаки распределения: один счёт раздаёт средства seed-клиента шести получателям, один из которых переводит дальше в кластер 0.',
};

function day(value: number): string {
	return `2026-07-${String(value).padStart(2, '0')}`;
}

type Metrics = Omit<NodeRow, 'evidence' | 'flags' | 'role' | 'roleScore'>;

const kzt = (value: number) => `${Math.round(value / 1000)} тыс. ₸`;
const pass = (row: Metrics) => (row.passThrough === null ? '—' : `${Math.round(row.passThrough * 100)}%`);

const EVIDENCE: Record<Role, (row: Metrics) => string> = {
	consolidator: (row) =>
		row.truncated
			? `Получает от ${row.inDeg} плательщиков ${kzt(row.inKzt)}; обход остановлен на 4-м колене, исходящие неизвестны.`
			: `Получает от ${row.inDeg} плательщиков (${row.seedsUpstream} seed выше) ${kzt(row.inKzt)}, отдаёт дальше ${pass(row)}.`,
	coordinator: (row) =>
		`Seed, рассылает ${kzt(row.outKzt)} на ${row.outDeg} счетов, среди них транзитные и консолидатор.`,
	distributor: (row) =>
		`Раздаёт ${kzt(row.outKzt)} на ${row.outDeg} счетов при ${row.inDeg} входящих: веер ${row.outDeg}:${row.inDeg}.`,
	peripheral: (row) =>
		row.truncated
			? `Одна входящая связь на ${kzt(row.inKzt)}; обход остановлен на 4-м колене.`
			: `Связей мало: ${row.inDeg} входящих и ${row.outDeg} исходящих на ${kzt(row.inKzt + row.outKzt)}.`,
	terminal: (row) =>
		`Получает ${kzt(row.inKzt)} от ${row.inDeg} плательщиков на ${row.depth}-м колене и никуда не переводит.`,
	transit: (row) =>
		`Пропускает ${pass(row)} полученного (${kzt(row.inKzt)} → ${kzt(row.outKzt)}), быстрый транзит ${Math.round(row.fastTransitShare * 100)}%.`,
};

function upstreamSeeds(
	target: string,
	graph: { incoming: ReadonlyMap<string, string[]>; seeds: ReadonlySet<string> },
): number {
	const { incoming, seeds } = graph;
	const seen = new Set<string>([target]);
	const queue = [target];
	let found = 0;

	while (queue.length > 0) {
		for (const src of incoming.get(queue.shift()!) ?? []) {
			if (!seen.has(src)) {
				seen.add(src);
				queue.push(src);
				if (seeds.has(src)) found += 1;
			}
		}
	}

	return found;
}

function buildNodes(edges: readonly EdgeRow[]): NodeRow[] {
	const seeds = new Set(NODES.filter((spec) => spec.seed === true).map((spec) => gid(spec.n)));
	const incoming = new Map<string, string[]>();

	for (const edge of edges) incoming.set(edge.dst, [...(incoming.get(edge.dst) ?? []), edge.src]);

	return NODES.map((spec) => {
		const id = gid(spec.n);
		const ins = edges.filter((edge) => edge.dst === id);
		const outs = edges.filter((edge) => edge.src === id);
		const sum = (rows: EdgeRow[], pick: (row: EdgeRow) => number) => rows.reduce((acc, row) => acc + pick(row), 0);
		const inKzt = sum(ins, (row) => row.sumKzt);
		const outKzt = sum(outs, (row) => row.sumKzt);
		const [cx, cy] = CENTRES[spec.cluster] ?? [0, 0];
		const [turn, radius] = spec.spot;
		const truncated = spec.depth === 4 && outs.length === 0;
		const isSeed = spec.seed === true;
		const metrics = {
			authority: Math.round((inKzt / 8_000_000) * 1000) / 1000,
			betweenness: ins.length > 0 && outs.length > 0 ? Math.round(ins.length * outs.length * 40) / 10_000 : 0,
			clusterId: spec.cluster,
			depth: spec.depth,
			fastTransitShare: spec.role === 'transit' ? 0.8 : 0,
			gid: id,
			hub: Math.round((outKzt / 8_000_000) * 1000) / 1000,
			inDeg: ins.length,
			inKzt,
			inTx: sum(ins, (row) => row.nTx),
			isSeed,
			outDeg: outs.length,
			outKzt,
			outTx: sum(outs, (row) => row.nTx),
			pagerank: Math.round((0.01 + inKzt / 20_000_000) * 10_000) / 10_000,
			passThrough: inKzt > 0 ? Math.round((outKzt / inKzt) * 100) / 100 : null,
			priorityScore: spec.priority,
			seedsUpstream: upstreamSeeds(id, { incoming, seeds }),
			truncated,
			x: Math.round((cx + radius * Math.cos(turn * 2 * Math.PI)) * 100) / 100,
			y: Math.round((cy + radius * Math.sin(turn * 2 * Math.PI)) * 100) / 100,
		};
		const flags = [
			...(isSeed ? ['seed'] : []),
			...(truncated ? ['truncated'] : []),
			...(spec.role === 'transit' ? ['fast_transit'] : []),
		];

		return { ...metrics, evidence: EVIDENCE[spec.role](metrics), flags, role: spec.role, roleScore: spec.roleScore };
	});
}

function buildClusters(nodes: readonly NodeRow[], edges: readonly EdgeRow[]): ClusterRow[] {
	return Object.keys(CENTRES).map((key) => {
		const clusterId = Number(key);
		const members = nodes.filter((node) => node.clusterId === clusterId);
		const inside = new Set(members.map((node) => node.gid));

		return {
			clusterId,
			hypothesis: HYPOTHESES[clusterId] ?? 'Гипотеза не сформулирована.',
			nNodes: members.length,
			nSeed: members.filter((node) => node.isSeed).length,
			sumKztInternal: edges
				.filter((edge) => inside.has(edge.src) && inside.has(edge.dst))
				.reduce((acc, edge) => acc + edge.sumKzt, 0),
			topGids: [...members]
				.sort((a, b) => b.priorityScore - a.priorityScore)
				.slice(0, 3)
				.map((node) => node.gid),
		};
	});
}

function whyFor(node: NodeRow): string {
	const terms = [
		`роль «${ROLE_LABELS[node.role].toLowerCase()}» (${node.roleScore.toFixed(2)})`,
		node.seedsUpstream > 0
			? `${node.seedsUpstream} seed выше по потоку`
			: `оборот ${Math.round((node.inKzt + node.outKzt) / 1000)} тыс. ₸`,
		node.betweenness > 0 ? `посредничество ${node.betweenness.toFixed(3)}` : `${node.inDeg + node.outDeg} связей`,
	];

	return terms.join(', ');
}

function buildTop(nodes: readonly NodeRow[]): TopRow[] {
	return [...nodes]
		.sort((a, b) => b.priorityScore - a.priorityScore)
		.slice(0, 10)
		.map((node, i) => ({
			gid: node.gid,
			priorityScore: node.priorityScore,
			rank: i + 1,
			role: node.role,
			why: whyFor(node),
		}));
}

function build(): Analysis {
	const edges: EdgeRow[] = EDGES.map(([src, dst, sumKzt, nTx, first, last]) => ({
		depth: Math.min(4, (NODES.find((spec) => spec.n === src)?.depth ?? 0) + 1),
		dst: gid(dst),
		firstDate: day(first),
		lastDate: day(last),
		nTx,
		src: gid(src),
		sumKzt,
	}));
	const nodes = buildNodes(edges);
	const dates = edges.flatMap((edge) => [edge.firstDate, edge.lastDate]).sort();

	return {
		clusters: buildClusters(nodes, edges),
		edges,
		nodes,
		stats: {
			edges: edges.length,
			nodes: nodes.length,
			periodFrom: dates[0] ?? day(1),
			periodTo: dates.at(-1) ?? day(31),
			seeds: nodes.filter((node) => node.isSeed).length,
			totalKzt: edges.reduce((acc, edge) => acc + edge.sumKzt, 0),
			transactions: edges.reduce((acc, edge) => acc + edge.nTx, 0),
		},
		thresholds: {
			consolidatorMinInDeg: 3,
			distributorMinOutDeg: 4,
			transitPassThroughMax: 1.2,
			transitPassThroughMin: 0.8,
		},
		top: buildTop(nodes),
	};
}

export const SAMPLE_ANALYSIS: Analysis = build();
