import { defineTool, type ToolSpec } from '@server/agent/usecase/defineTool';
import { type Analysis, gidSchema, type NodeCard, ROLES, type TopRow } from '@server/graph/model/graph.schema';
import { rankTop } from '@server/graph/model/priority';
import { coverageGaps, findCollectors, nodeCard, simulateRemoval, traceFlow } from '@server/graph/model/queries';
import { getAnalysis } from '@server/graph/usecase/getAnalysis';
import { type Ctx } from '@server/kernel/ctx';
import 'server-only';
import { z } from 'zod';

/**
 * The agent's tools over the money graph. Spread into `TOOLS` in `agent/usecase/tools.ts`.
 *
 * Every one is read-only, so none needs a confirmation. Each re-checks its own preconditions —
 * that the gids and the cluster it was handed exist — because the model is not the authority on
 * that: an unknown gid is a successful call reporting a refusal, which the model can read and
 * correct, not a throw. A missing analysis IS a throw: it is a failure of the run, not of the
 * question, and `executeTool` turns it into a row that says "failed".
 *
 * Results are capped. A tool result goes back to the model verbatim, and a 4-hop trace of a seed
 * can be hundreds of edges — which costs tokens and buries the answer. Every capped list says how
 * many there were in total, so the model can say "показаны 20 из 143" instead of guessing.
 */

/** A rule said no. Returned, never thrown: see above. */
export interface Refusal {
	reason: string;
	refused: true;
}

/** Where a tool gets the analysis. The app passes `getAnalysis`; a test passes a fixture. */
export type AnalysisSource = (ctx: Ctx) => Analysis | null;

const COLLECTORS_SHOWN = 20;
const CLUSTER_MEMBERS_SHOWN = 10;
const FLOW_EDGES_SHOWN = 60;

/**
 * Scores and ratios as the model should quote them. A cheap model copies `2.7437165025037142`
 * verbatim however the prompt asks; a result that is already `2.74` cannot be quoted wrong. The
 * centralities are tiny, so they keep three significant digits rather than two decimals.
 */
function fixed(value: number): number {
	return Math.round(value * 100) / 100;
}

function significant(value: number): number {
	return Number(value.toPrecision(3));
}

function rowForModel(row: TopRow): TopRow {
	return { ...row, priorityScore: fixed(row.priorityScore) };
}

function cardForModel(card: NodeCard): NodeCard {
	const { node } = card;

	return {
		...card,
		node: {
			...node,
			authority: significant(node.authority),
			betweenness: significant(node.betweenness),
			fastTransitShare: fixed(node.fastTransitShare),
			hub: significant(node.hub),
			pagerank: significant(node.pagerank),
			passThrough: node.passThrough === null ? null : fixed(node.passThrough),
			priorityScore: fixed(node.priorityScore),
			roleScore: fixed(node.roleScore),
		},
	};
}

const gidArg = gidSchema.describe(
	'A client gid: the full digit string, exactly as a tool returned it. Never a number.',
);

function refuse(reason: string): Refusal {
	return { reason, refused: true };
}

function loaded(load: AnalysisSource, ctx: Ctx): Analysis {
	const analysis = load(ctx);

	if (analysis === null) throw new Error('Анализ ещё не построен: запустите `pnpm pipeline`.');

	return analysis;
}

/** The gids the analysis has never seen, in the order given. */
function unknownGids(a: Analysis, gids: readonly string[]): string[] {
	const known = new Set(a.nodes.map((node) => node.gid));

	return gids.filter((gid) => !known.has(gid));
}

function refuseUnknown(unknown: readonly string[]): Refusal {
	return refuse(`В графе нет узлов с такими gid: ${unknown.join(', ')}. Проверьте gid.`);
}

/**
 * Every node ranked, so a filtered list keeps the global rank («№ 7 в общем списке») instead of
 * renumbering from 1. Cached per analysis object: `readAnalysis` returns the same one until the
 * file changes.
 */
const rankedCache = new WeakMap<Analysis, TopRow[]>();

function rankedAll(a: Analysis): TopRow[] {
	const cached = rankedCache.get(a);

	if (cached !== undefined) return cached;

	const ranked = rankTop(a.nodes, a.nodes.length);

	rankedCache.set(a, ranked);

	return ranked;
}

function topNodes(a: Analysis, input: { clusterId?: number | undefined; limit: number; role?: string | undefined }) {
	if (input.role === undefined && input.clusterId === undefined) {
		// Every node is ranked, not only the 50 the list stores: «№ 1 из 2 248» is the true claim.
		return { rows: a.top.slice(0, input.limit).map(rowForModel), totalMatching: a.nodes.length };
	}

	const clusterOf = new Map(a.nodes.map((node) => [node.gid, node.clusterId]));
	const matching = rankedAll(a).filter(
		(row) =>
			(input.role === undefined || row.role === input.role) &&
			(input.clusterId === undefined || clusterOf.get(row.gid) === input.clusterId),
	);

	return { rows: matching.slice(0, input.limit).map(rowForModel), totalMatching: matching.length };
}

function cluster(a: Analysis, clusterId: number) {
	const row = a.clusters.find((candidate) => candidate.clusterId === clusterId);

	if (row === undefined) {
		return refuse(`Кластера ${clusterId} нет. Номера кластеров: 0–${Math.max(0, a.clusters.length - 1)}.`);
	}

	const members = a.nodes.filter((node) => node.clusterId === clusterId);
	const roleCounts = Object.fromEntries(
		ROLES.map((role) => [role, members.filter((node) => node.role === role).length]),
	);
	const topMembers = [...members]
		.sort((x, y) => y.priorityScore - x.priorityScore)
		.slice(0, CLUSTER_MEMBERS_SHOWN)
		.map((node) => ({ evidence: node.evidence, gid: node.gid, priorityScore: node.priorityScore, role: node.role }));

	return { cluster: row, roleCounts, topMembers };
}

function collectors(a: Analysis, input: { gids: string[]; maxHops: number }) {
	const gids = [...new Set(input.gids)];
	const unknown = unknownGids(a, gids);

	if (unknown.length > 0) return refuseUnknown(unknown);
	if (gids.length < 2) return refuse('Нужно хотя бы два разных gid.');

	const found = findCollectors(a, { gids, maxHops: input.maxHops }).sort(
		(x, y) => y.reachedFrom - x.reachedFrom || y.kztFromSources - x.kztFromSources,
	);

	return { collectors: found.slice(0, COLLECTORS_SHOWN), maxHops: input.maxHops, sources: gids, total: found.length };
}

function flow(a: Analysis, input: { direction: 'down' | 'up'; gid: string; maxHops: number }) {
	const unknown = unknownGids(a, [input.gid]);

	if (unknown.length > 0) return refuseUnknown(unknown);

	const traced = traceFlow(a, input);
	const edges = [...traced.edges].sort((x, y) => y.sumKzt - x.sumKzt).slice(0, FLOW_EDGES_SHOWN);
	const shown = new Set(edges.flatMap((edge) => [edge.src, edge.dst]));

	return {
		...traced,
		edges,
		nodes: traced.nodes.filter((node) => node.gid === input.gid || shown.has(node.gid)),
		totalEdges: traced.edges.length,
		totalKzt: traced.edges.reduce((sum, edge) => sum + edge.sumKzt, 0),
		totalNodes: traced.nodes.length,
	};
}

function removal(a: Analysis, gids: string[]) {
	const unique = [...new Set(gids)];
	const unknown = unknownGids(a, unique);

	if (unknown.length > 0) return refuseUnknown(unknown);

	return simulateRemoval(a, unique);
}

export function graphTools(load: AnalysisSource): ToolSpec[] {
	return [
		defineTool({
			description:
				'The ranked list of whom to check first, highest priority first, each with a one-line reason. Start here for "кого проверять первым". Filter by role or by cluster to answer "главные транзитёры" or "кто важен в кластере 3".',
			handler: (ctx, args) => topNodes(loaded(load, ctx), args),
			label: 'Топ приоритетов',
			name: 'get_top_nodes',
			parameters: z.object({
				clusterId: z.number().int().nonnegative().optional().describe('Only nodes of this cluster.'),
				limit: z.number().int().min(1).max(50).default(10).describe('How many rows, 1–50. Defaults to 10.'),
				role: z.enum(ROLES).optional().describe('Only nodes with this role.'),
			}),
		}),
		defineTool({
			description:
				"One node's card: its role with the evidence and every metric behind it, its cluster, priority, flags such as truncated, and its five largest senders and receivers. Call this before explaining why a node has its role.",
			handler: (ctx, args) => {
				const card = nodeCard(loaded(load, ctx), args.gid);

				return card === null ? refuseUnknown([args.gid]) : cardForModel(card);
			},
			label: 'Карточка узла',
			name: 'get_node',
			parameters: z.object({ gid: gidArg }),
		}),
		defineTool({
			description:
				'One cluster (a Louvain community): its size, seeds, internal KZT, the hypothesis about it, how many nodes hold each role, and its highest-priority members.',
			handler: (ctx, args) => cluster(loaded(load, ctx), args.clusterId),
			label: 'Кластер',
			name: 'get_cluster',
			parameters: z.object({ clusterId: z.number().int().nonnegative().describe('The cluster number.') }),
		}),
		defineTool({
			description:
				'Who collects money from several given nodes: the nodes reached from at least two of them along outgoing transfers within maxHops, most shared first, with the KZT they received. Use for "кто собирает деньги с этих".',
			handler: (ctx, args) => collectors(loaded(load, ctx), args),
			label: 'Кто собирает деньги',
			name: 'find_collectors',
			parameters: z.object({
				gids: z.array(gidArg).min(2).max(20).describe('2–20 source gids.'),
				maxHops: z
					.number()
					.int()
					.min(1)
					.max(4)
					// 2, not 3: on the real data five sources share 581 receivers within 3 hops,
					// which reads as "everybody" rather than as a finding.
					.default(2)
					.describe('How far to follow the money, 1–4. Defaults to 2.'),
			}),
		}),
		defineTool({
			description:
				"The money flow around one node: 'down' follows where its money went, 'up' where the money it received came from, up to maxHops transfers away. Returns the largest edges and the totals.",
			handler: (ctx, args) => flow(loaded(load, ctx), args),
			label: 'Поток денег',
			name: 'trace_flow',
			parameters: z.object({
				direction: z.enum(['down', 'up']).describe("'down': where the money went. 'up': where it came from."),
				gid: gidArg,
				maxHops: z.number().int().min(1).max(4).default(2).describe('1–4. Defaults to 2.'),
			}),
		}),
		defineTool({
			description:
				'What happens to the network if these nodes are blocked: weakly connected components, the largest one, and how many seeds it still holds, before and after. Use for "что если убрать".',
			handler: (ctx, args) => removal(loaded(load, ctx), args.gids),
			label: 'Что если убрать',
			name: 'simulate_removal',
			parameters: z.object({ gids: z.array(gidArg).min(1).max(20).describe('1–20 gids to remove.') }),
		}),
		defineTool({
			description:
				'What the data cannot show — where the traversal stopped, what inflow is missing — how many nodes each gap affects, and the next data request to the bank that would close it.',
			handler: (ctx) => ({ gaps: coverageGaps(loaded(load, ctx)) }),
			label: 'Пробелы в данных',
			name: 'coverage_gaps',
			parameters: z.object({}),
		}),
	];
}

/** The tools the app runs: over `output/analysis.json`, through the page's own entry point. */
export const GRAPH_TOOLS: readonly ToolSpec[] = graphTools(getAnalysis);
