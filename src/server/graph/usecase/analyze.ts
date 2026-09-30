import { detectClusters, summarizeClusters } from '@server/graph/model/clusters';
import {
	type Analysis,
	analysisSchema,
	type AnalysisStats,
	type EdgeRow,
	type NodeRow,
	type RawGraph,
} from '@server/graph/model/graph.schema';
import { computeMetrics } from '@server/graph/model/metrics';
import { rankTop, scorePriority } from '@server/graph/model/priority';
import { assignRoles, ROLE_THRESHOLDS } from '@server/graph/model/roles';
import { contractError } from '@server/graph/repo/analysis';
import { computeLayout } from '@server/graph/usecase/layout';
import 'server-only';

/**
 * The whole computation, as one pure function: `RawGraph` in, `Analysis` out.
 *
 * It composes the analytics owner's model functions in the order the plan fixes — metrics → roles → clusters →
 * layout → priority → top — and adds the two things that are composition rather than analysis:
 * per-edge first and last dates from the transactions, and the dataset's summary statistics.
 *
 * The result is validated against `analysisSchema` before it is returned. Anything that reaches
 * the CSVs and the screen has therefore passed the contract, and a rule that produces an evidence
 * string of 201 characters or a score of 1.2 fails here, at pipeline time, with the node named —
 * not on the projector.
 */

/** The ТЗ asks for at least 20. `get_top_nodes` may ask for up to 50 and serves them from here. */
export const TOP_LIMIT = 50;

/** A model function that skips a node is a bug in that function, and this says which one. */
function demand<T>(map: Map<string, T>, about: { gid: string; source: string }): T {
	const value = map.get(about.gid);

	if (value === undefined) {
		throw new Error(`${about.source} returned nothing for node ${about.gid}; every node must have a value.`);
	}

	return value;
}

function buildEdges(raw: RawGraph): EdgeRow[] {
	const span = new Map<string, { first: string; last: string }>();

	for (const tx of raw.transactions) {
		const key = `${tx.src}>${tx.dst}`;
		const current = span.get(key);

		if (current === undefined) {
			span.set(key, { first: tx.date, last: tx.date });
		} else {
			if (tx.date < current.first) current.first = tx.date;
			if (tx.date > current.last) current.last = tx.date;
		}
	}

	return raw.edges.map((edge) => {
		const dates = span.get(`${edge.src}>${edge.dst}`);

		if (dates === undefined) {
			throw new Error(
				`Edge ${edge.src} → ${edge.dst} has no transactions behind it: edges.parquet and transactions.parquet disagree.`,
			);
		}

		return { ...edge, firstDate: dates.first, lastDate: dates.last };
	});
}

function computeStats(raw: RawGraph): AnalysisStats {
	const dates = raw.transactions.map((tx) => tx.date).sort();
	const periodFrom = dates[0];
	const periodTo = dates.at(-1);

	if (periodFrom === undefined || periodTo === undefined) {
		throw new Error('transactions.parquet is empty; there is no period to analyse.');
	}

	return {
		edges: raw.edges.length,
		nodes: raw.nodes.length,
		periodFrom,
		periodTo,
		seeds: raw.nodes.filter((node) => node.isSeed).length,
		totalKzt: raw.edges.reduce((sum, edge) => sum + edge.sumKzt, 0),
		transactions: raw.transactions.length,
	};
}

export function analyze(raw: RawGraph): Analysis {
	const metrics = computeMetrics(raw);
	const verdicts = assignRoles(raw, metrics);
	const clusterOf = detectClusters(raw);
	const positions = computeLayout(raw);

	const drafts = raw.nodes.map((node): Omit<NodeRow, 'priorityScore'> => {
		const { gid } = node;
		const position = demand(positions, { gid, source: 'computeLayout' });

		return {
			...demand(metrics, { gid, source: 'computeMetrics' }),
			...demand(verdicts, { gid, source: 'assignRoles' }),
			clusterId: demand(clusterOf, { gid, source: 'detectClusters' }),
			x: position.x,
			y: position.y,
		};
	});

	const priorities = scorePriority(drafts);
	const nodes: NodeRow[] = drafts.map((draft) => ({
		...draft,
		priorityScore: demand(priorities, { gid: draft.gid, source: 'scorePriority' }),
	}));

	const result = analysisSchema.safeParse({
		clusters: summarizeClusters(raw, nodes),
		edges: buildEdges(raw),
		nodes,
		stats: computeStats(raw),
		thresholds: ROLE_THRESHOLDS,
		top: rankTop(nodes, TOP_LIMIT),
	});

	if (!result.success) throw contractError(result.error, 'The analysis');

	return result.data;
}
