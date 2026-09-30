import { type NodeRow, type Role, type TopRow } from '@server/graph/model/graph.schema';
import 'server-only';

type PriorityNode = Omit<NodeRow, 'priorityScore'>;

interface Factor {
	clause: string;
	contribution: number;
}

interface PriorityTerms {
	betweenness: number;
	clusterSeedDensity: number;
	flow: number;
	pagerank: number;
	role: number;
	seeds: number;
}

const WEIGHTS: PriorityTerms = {
	betweenness: 0.15,
	clusterSeedDensity: 0.1,
	flow: 0.2,
	pagerank: 0.15,
	role: 0.25,
	seeds: 0.15,
};

const ROLE_WEIGHT: Record<Role, number> = {
	consolidator: 0.95,
	coordinator: 1,
	distributor: 0.9,
	peripheral: 0,
	terminal: 0.55,
	transit: 0.8,
};

const ROLE_LABEL: Record<Role, string> = {
	consolidator: 'консолидация',
	coordinator: 'координация',
	distributor: 'распределение',
	peripheral: 'периферия',
	terminal: 'конечный получатель',
	transit: 'транзит',
};

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function compareGids(a: string, b: string): number {
	return a.length - b.length || a.localeCompare(b);
}

function clusterDensities(nodes: PriorityNode[]): Map<number, number> {
	const counts = new Map<number, { nodes: number; seeds: number }>();

	for (const node of nodes) {
		const count = counts.get(node.clusterId) ?? { nodes: 0, seeds: 0 };
		count.nodes += 1;
		count.seeds += Number(node.isSeed);
		counts.set(node.clusterId, count);
	}

	return new Map([...counts].map(([clusterId, count]) => [clusterId, count.seeds / count.nodes]));
}

function termsFor(nodes: PriorityNode[]): Map<string, PriorityTerms> {
	const maxFlow = Math.max(1, ...nodes.map((node) => Math.log1p(node.inKzt + node.outKzt)));
	const maxSeeds = Math.max(1, ...nodes.map((node) => node.seedsUpstream));
	const maxBetweenness = Math.max(Number.EPSILON, ...nodes.map((node) => node.betweenness));
	const maxPagerank = Math.max(Number.EPSILON, ...nodes.map((node) => node.pagerank));
	const densities = clusterDensities(nodes);

	return new Map(
		nodes.map((node) => [
			node.gid,
			{
				betweenness: clamp(node.betweenness / maxBetweenness),
				clusterSeedDensity: densities.get(node.clusterId) ?? 0,
				flow: Math.log1p(node.inKzt + node.outKzt) / maxFlow,
				pagerank: clamp(node.pagerank / maxPagerank),
				role: ROLE_WEIGHT[node.role] * node.roleScore,
				seeds: node.seedsUpstream / maxSeeds,
			},
		]),
	);
}

function weightedScore(terms: PriorityTerms): number {
	return (Object.keys(WEIGHTS) as (keyof PriorityTerms)[]).reduce(
		(total, key) => total + WEIGHTS[key] * terms[key],
		0,
	);
}

/**
 * Documented weighted formula: role 25%, log flow 20%, seed reach 15%, betweenness 15%, PageRank
 * 15%, and cluster seed density 10%. Known seeds get a 25% penalty; truncated nodes get 15%.
 */
export function scorePriority(nodes: PriorityNode[]): Map<string, number> {
	const terms = termsFor(nodes);

	return new Map(
		nodes.map((node) => {
			let score = weightedScore(terms.get(node.gid)!);
			if (node.isSeed) score *= 0.75;
			if (node.truncated) score *= 0.85;

			return [node.gid, Math.round(clamp(score) * 1_000_000) / 1_000_000];
		}),
	);
}

function numeric(value: number, digits = 2): string {
	return value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function dominantFactors(node: NodeRow, terms: PriorityTerms): Factor[] {
	return [
		{
			clause: `сила роли «${ROLE_LABEL[node.role]}»: ${numeric(node.roleScore)}`,
			contribution: WEIGHTS.role * terms.role,
		},
		{
			clause: `наблюдаемый поток: ${Math.round(node.inKzt + node.outKzt).toLocaleString('ru-RU')} KZT`,
			contribution: WEIGHTS.flow * terms.flow,
		},
		{
			clause: `достижим от ${node.seedsUpstream} seed`,
			contribution: WEIGHTS.seeds * terms.seeds,
		},
		{
			clause: `посредничество: ${numeric(node.betweenness, 3)}`,
			contribution: WEIGHTS.betweenness * terms.betweenness,
		},
		{
			clause: `PageRank: ${numeric(node.pagerank, 3)}`,
			contribution: WEIGHTS.pagerank * terms.pagerank,
		},
		{
			clause: `seed в кластере: ${numeric(terms.clusterSeedDensity * 100, 0)}%`,
			contribution: WEIGHTS.clusterSeedDensity * terms.clusterSeedDensity,
		},
	].sort((left, right) => right.contribution - left.contribution || left.clause.localeCompare(right.clause));
}

function explain(node: NodeRow, terms: PriorityTerms): string {
	const penalties: string[] = [];
	if (node.isSeed) penalties.push('известный seed: штраф 25%');
	if (node.truncated) penalties.push('граница 4-го колена: штраф 15%');
	const facts = dominantFactors(node, terms)
		.slice(0, 3 - penalties.length)
		.map((factor) => factor.clause);

	return [...facts, ...penalties].join('; ');
}

/** Stable analyst ranking. The validated caller decides the requested minimum/maximum limit. */
export function rankTop(nodes: NodeRow[], limit: number): TopRow[] {
	const terms = termsFor(nodes);

	return [...nodes]
		.sort(
			(a, b) =>
				Number(a.isSeed) - Number(b.isSeed) || b.priorityScore - a.priorityScore || compareGids(a.gid, b.gid),
		)
		.slice(0, Math.max(0, Math.trunc(limit)))
		.map((node, index) => ({
			gid: node.gid,
			priorityScore: node.priorityScore,
			rank: index + 1,
			role: node.role,
			why: explain(node, terms.get(node.gid)!),
		}));
}
