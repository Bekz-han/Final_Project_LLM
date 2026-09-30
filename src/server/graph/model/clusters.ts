import { type ClusterRow, type NodeRow, type RawGraph, type Role } from '@server/graph/model/graph.schema';
import { UndirectedGraph } from 'graphology';
import louvain from 'graphology-communities-louvain';
import 'server-only';

interface ProjectedEdge {
	a: string;
	b: string;
	nTx: number;
	sumKzt: number;
	weight: number;
}

interface Community {
	gids: string[];
	internalKzt: number;
}

const ROLE_LABELS: Record<Role, string> = {
	consolidator: 'консолидации',
	coordinator: 'координации',
	distributor: 'распределения',
	peripheral: 'периферийного движения',
	terminal: 'конечного получения',
	transit: 'транзита',
};

function compareGids(a: string, b: string): number {
	return a.length - b.length || a.localeCompare(b);
}

/** Small deterministic PRNG, seeded with 42 for every Louvain component. */
function seededRandom(): () => number {
	let state = 42;

	return () => {
		state = (state * 16_807) % 2_147_483_647;

		return (state - 1) / 2_147_483_646;
	};
}

function project(raw: RawGraph): ProjectedEdge[] {
	const known = new Set(raw.nodes.map((node) => node.gid));
	const pairs = new Map<string, Omit<ProjectedEdge, 'weight'>>();

	for (const edge of raw.edges) {
		if (known.has(edge.src) && known.has(edge.dst)) {
			const [a, b] = compareGids(edge.src, edge.dst) <= 0 ? [edge.src, edge.dst] : [edge.dst, edge.src];
			const key = `${a}|${b}`;
			const current = pairs.get(key) ?? { a, b, nTx: 0, sumKzt: 0 };
			current.nTx += edge.nTx;
			current.sumKzt += edge.sumKzt;
			pairs.set(key, current);
		}
	}

	return [...pairs.values()]
		.map((edge) => ({
			...edge,
			weight: Math.log1p(edge.sumKzt) + 0.25 * Math.log1p(edge.nTx),
		}))
		.sort((left, right) => compareGids(left.a, right.a) || compareGids(left.b, right.b));
}

function connectedComponents(gids: string[], edges: ProjectedEdge[]): string[][] {
	const adjacent = new Map(gids.map((gid) => [gid, new Set<string>()]));

	for (const edge of edges) {
		adjacent.get(edge.a)?.add(edge.b);
		adjacent.get(edge.b)?.add(edge.a);
	}

	const seen = new Set<string>();
	const components: string[][] = [];

	for (const start of gids) {
		if (!seen.has(start)) {
			const members: string[] = [];
			const pending = [start];
			seen.add(start);

			while (pending.length > 0) {
				const gid = pending.pop()!;
				members.push(gid);

				for (const neighbour of [...(adjacent.get(gid) ?? [])].sort(compareGids)) {
					if (!seen.has(neighbour)) {
						seen.add(neighbour);
						pending.push(neighbour);
					}
				}
			}

			components.push(members.sort(compareGids));
		}
	}

	return components;
}

function partitionComponent(members: string[], edges: ProjectedEdge[]): string[][] {
	if (members.length === 1) return [members];

	const inside = new Set(members);
	const graph = new UndirectedGraph<Record<string, never>, { weight: number }>();
	for (const gid of members) graph.addNode(gid);
	for (const edge of edges) {
		if (inside.has(edge.a) && inside.has(edge.b)) {
			graph.addEdge(edge.a, edge.b, { weight: edge.weight });
		}
	}

	const mapping = louvain(graph, { getEdgeWeight: 'weight', randomWalk: true, rng: seededRandom() });
	const groups = new Map<number, string[]>();
	for (const gid of members) {
		const community = mapping[gid]!;
		groups.set(community, [...(groups.get(community) ?? []), gid]);
	}

	return [...groups.values()].map((group) => group.sort(compareGids));
}

/**
 * Louvain on the undirected weighted projection requested by the ТЗ. Reciprocal edges are merged;
 * their weight is log1p(sumKzt) + 0.25 * log1p(nTx). Components use RNG seed 42 independently.
 */
export function detectClusters(raw: RawGraph): Map<string, number> {
	const gids = [...new Set(raw.nodes.map((node) => node.gid))].sort(compareGids);
	const edges = project(raw);
	const groups = connectedComponents(gids, edges).flatMap((members) => partitionComponent(members, edges));
	const provisional = new Map<string, number>();
	groups.forEach((members, index) => members.forEach((gid) => provisional.set(gid, index)));

	const communities: Community[] = groups.map((members, index) => ({
		gids: members,
		internalKzt: raw.edges
			.filter((edge) => provisional.get(edge.src) === index && provisional.get(edge.dst) === index)
			.reduce((total, edge) => total + edge.sumKzt, 0),
	}));
	communities.sort(
		(left, right) => right.internalKzt - left.internalKzt || compareGids(left.gids[0] ?? '', right.gids[0] ?? ''),
	);

	const result = new Map<string, number>();
	communities.forEach((community, clusterId) => {
		for (const gid of community.gids) result.set(gid, clusterId);
	});

	return result;
}

function clusterHypothesis(members: NodeRow[], internalKzt: number): string {
	const roleCounts = new Map<Role, number>();
	for (const member of members) roleCounts.set(member.role, (roleCounts.get(member.role) ?? 0) + 1);
	const nSeed = members.filter((member) => member.isSeed).length;
	const hasFlowCycle = roleCounts.has('consolidator') && roleCounts.has('distributor');
	const dominant = [...roleCounts].sort(
		([leftRole, leftCount], [rightRole, rightCount]) => rightCount - leftCount || leftRole.localeCompare(rightRole),
	)[0]?.[0];
	const seedSignal = nSeed === 0 ? 'без известных seed' : `с ${nSeed} известными seed`;
	const roleSignal = hasFlowCycle
		? 'возможны консолидация и последующее распределение'
		: `преобладают признаки ${ROLE_LABELS[dominant ?? 'peripheral']}`;

	return `Гипотеза для проверки: сообщество ${seedSignal}, ${roleSignal}; внутренний поток ${Math.round(internalKzt).toLocaleString('ru-RU')} KZT.`;
}

/** One deterministic row per cluster; every conclusion remains a review hypothesis. */
export function summarizeClusters(raw: RawGraph, nodes: NodeRow[]): ClusterRow[] {
	const byCluster = new Map<number, NodeRow[]>();

	for (const node of nodes) {
		byCluster.set(node.clusterId, [...(byCluster.get(node.clusterId) ?? []), node]);
	}

	return [...byCluster.entries()]
		.sort(([left], [right]) => left - right)
		.map(([clusterId, members]) => {
			const inside = new Set(members.map((member) => member.gid));
			const sumKztInternal = raw.edges
				.filter((edge) => inside.has(edge.src) && inside.has(edge.dst))
				.reduce((sum, edge) => sum + edge.sumKzt, 0);

			return {
				clusterId,
				hypothesis: clusterHypothesis(members, sumKztInternal),
				nNodes: members.length,
				nSeed: members.filter((member) => member.isSeed).length,
				sumKztInternal,
				topGids: [...members]
					.sort((a, b) => b.priorityScore - a.priorityScore || compareGids(a.gid, b.gid))
					.slice(0, 5)
					.map((member) => member.gid),
			};
		});
}
