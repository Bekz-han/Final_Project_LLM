import { type Analysis, type RawGraph } from '@server/graph/model/graph.schema';
import { analyze } from '@server/graph/usecase/analyze';
import { type AnalysisSource, graphTools } from '@server/graph/usecase/tools';
import { type Ctx } from '@server/kernel/ctx';
import { describe, expect, it } from 'vitest';

/**
 * These test the tools' own rules — the re-checks, the refusals, the caps, the filters — over a
 * real `analyze` of a small graph. What the queries underneath compute is the analytics owner's and is tested in
 * `graph/model`; here only its shape is relied on.
 */
const ctx: Ctx = { now: new Date('2026-07-31T12:00:00.000Z') };

const SEED = '100000000000000001';
const PAYEE = '100000000000000002';
const SIDE = '100000000000000003';
const SINK = '100000000000000004';
const UNKNOWN = '199999999999999999';

const RAW: RawGraph = {
	edges: [
		{ depth: 1, dst: PAYEE, nTx: 2, src: SEED, sumKzt: 30_000 },
		{ depth: 1, dst: SIDE, nTx: 1, src: SEED, sumKzt: 7_000 },
		{ depth: 2, dst: SINK, nTx: 1, src: PAYEE, sumKzt: 25_000 },
	],
	nodes: [
		{ depth: 0, gid: SEED, isSeed: true },
		{ depth: 1, gid: PAYEE, isSeed: false },
		{ depth: 1, gid: SIDE, isSeed: false },
		{ depth: 2, gid: SINK, isSeed: false },
	],
	transactions: [
		{ date: '2026-07-03', dst: PAYEE, src: SEED, sumKzt: 10_000 },
		{ date: '2026-07-10', dst: PAYEE, src: SEED, sumKzt: 20_000 },
		{ date: '2026-07-05', dst: SIDE, src: SEED, sumKzt: 7_000 },
		{ date: '2026-07-11', dst: SINK, src: PAYEE, sumKzt: 25_000 },
	],
};

const ANALYSIS: Analysis = analyze(RAW);

/** Runs one tool by name exactly as the dispatcher does: validation included. */
function runOver(load: AnalysisSource, input: { args: Record<string, unknown>; name: string }): unknown {
	const { args, name } = input;
	const tool = graphTools(load).find((candidate) => candidate.name === name);

	if (tool === undefined) throw new Error(`no tool ${name}`);

	return tool.handler(ctx, args);
}

function run(name: string, args: Record<string, unknown>): unknown {
	return runOver(() => ANALYSIS, { args, name });
}

describe('the graph tools', () => {
	it('are the seven from the plan, and every one has a Russian label for the panel', () => {
		const tools = graphTools(() => ANALYSIS);

		expect(tools.map((tool) => tool.name)).toEqual([
			'get_top_nodes',
			'get_node',
			'get_cluster',
			'find_collectors',
			'trace_flow',
			'simulate_removal',
			'coverage_gaps',
		]);

		for (const tool of tools) expect(tool.label).toMatch(/[а-яё]/iu);
	});

	/** A missing analysis is a failed run, not a refusal: the panel must say "failed". */
	it('throws, naming the fix, when the pipeline has not run', () => {
		expect(() => runOver(() => null, { args: {}, name: 'get_top_nodes' })).toThrow(/pnpm pipeline/u);
	});

	it('rejects a gid passed as a number, because a number that large has already been rounded', () => {
		expect(() => run('get_node', { gid: 100_000_000_000_000_000 })).toThrow();
	});
});

describe('get_top_nodes', () => {
	it('serves the precomputed top list, cut to the limit', () => {
		const result = run('get_top_nodes', { limit: 2 }) as { rows: unknown[]; totalMatching: number };

		expect(result.rows.map((row) => (row as { gid: string }).gid)).toEqual(
			ANALYSIS.top.slice(0, 2).map((row) => row.gid),
		);
		expect(result.totalMatching).toBe(ANALYSIS.nodes.length);
	});

	/** A cheap model quotes whatever digits it is given; a result of 2.74 cannot be quoted as 2.7437…. */
	it('rounds the scores it hands the model to two decimals', () => {
		const { rows } = run('get_top_nodes', {}) as { rows: { priorityScore: number }[] };
		const { node } = run('get_node', { gid: PAYEE }) as { node: { passThrough: number | null; roleScore: number } };

		for (const value of [...rows.map((row) => row.priorityScore), node.roleScore, node.passThrough ?? 0]) {
			expect(Math.round(value * 100) / 100).toBe(value);
		}
	});

	it('defaults to ten rows and refuses more than fifty', () => {
		expect((run('get_top_nodes', {}) as { rows: unknown[] }).rows.length).toBeLessThanOrEqual(10);
		expect(() => run('get_top_nodes', { limit: 51 })).toThrow();
	});

	it('filters by role and keeps the global rank rather than renumbering', () => {
		const role = ANALYSIS.nodes[0]?.role;
		const result = run('get_top_nodes', { role }) as { rows: { rank: number; role: string }[] };
		const everyRank = ANALYSIS.nodes.length;

		expect(result.rows.length).toBeGreaterThan(0);

		for (const row of result.rows) {
			expect(row.role).toBe(role);
			expect(row.rank).toBeGreaterThanOrEqual(1);
			expect(row.rank).toBeLessThanOrEqual(everyRank);
		}
	});

	it('returns nothing, not everything, for a cluster that has no nodes', () => {
		const result = run('get_top_nodes', { clusterId: 999 }) as { rows: unknown[]; totalMatching: number };

		expect(result).toEqual({ rows: [], totalMatching: 0 });
	});
});

describe('get_node', () => {
	it('returns the card of a known gid', () => {
		expect(run('get_node', { gid: PAYEE })).toMatchObject({ node: { gid: PAYEE } });
	});

	/** A refusal is a successful call reporting a refusal: the model reads it and corrects itself. */
	it('refuses an unknown gid, naming it, instead of throwing', () => {
		expect(run('get_node', { gid: UNKNOWN })).toEqual({
			reason: expect.stringContaining(UNKNOWN) as unknown,
			refused: true,
		});
	});
});

describe('get_cluster', () => {
	it('returns the cluster with a role count that adds up to its size', () => {
		const clusterId = ANALYSIS.nodes[0]?.clusterId ?? 0;
		const result = run('get_cluster', { clusterId }) as {
			cluster: { nNodes: number };
			roleCounts: Record<string, number>;
			topMembers: unknown[];
		};
		const counted = Object.values(result.roleCounts).reduce((sum, count) => sum + count, 0);

		expect(counted).toBe(result.cluster.nNodes);
		expect(result.topMembers.length).toBeGreaterThan(0);
	});

	it('refuses a cluster that does not exist', () => {
		expect(run('get_cluster', { clusterId: 999 })).toMatchObject({ refused: true });
	});
});

describe('find_collectors', () => {
	it('refuses when any source is unknown, naming only the unknown one', () => {
		const result = run('find_collectors', { gids: [SEED, UNKNOWN] }) as { reason: string; refused: boolean };

		expect(result.refused).toBe(true);
		expect(result.reason).toContain(UNKNOWN);
		expect(result.reason).not.toContain(SEED);
	});

	it('refuses the same gid twice, which is one source, not two', () => {
		expect(run('find_collectors', { gids: [SEED, SEED] })).toMatchObject({ refused: true });
	});

	it('reports the sources, the hop limit and the total alongside the list', () => {
		expect(run('find_collectors', { gids: [SEED, PAYEE] })).toMatchObject({
			collectors: expect.any(Array) as unknown,
			maxHops: 2,
			sources: [SEED, PAYEE],
			total: expect.any(Number) as unknown,
		});
	});

	it('refuses fewer than two or more than twenty sources at validation', () => {
		expect(() => run('find_collectors', { gids: [SEED] })).toThrow();
		expect(() => run('find_collectors', { gids: Array.from({ length: 21 }, () => SEED) })).toThrow();
	});
});

describe('trace_flow', () => {
	it('refuses an unknown gid', () => {
		expect(run('trace_flow', { direction: 'down', gid: UNKNOWN })).toMatchObject({ refused: true });
	});

	it('says how much there was in total, so a capped list is never mistaken for the whole', () => {
		expect(run('trace_flow', { direction: 'down', gid: SEED })).toMatchObject({
			direction: 'down',
			gid: SEED,
			maxHops: 2,
			totalEdges: expect.any(Number) as unknown,
			totalKzt: expect.any(Number) as unknown,
			totalNodes: expect.any(Number) as unknown,
		});
	});

	it('accepts only the two directions', () => {
		expect(() => run('trace_flow', { direction: 'sideways', gid: SEED })).toThrow();
	});
});

describe('simulate_removal', () => {
	it('refuses an unknown gid', () => {
		expect(run('simulate_removal', { gids: [UNKNOWN] })).toMatchObject({ refused: true });
	});

	it('reports before and after for the gids removed, each counted once', () => {
		expect(run('simulate_removal', { gids: [PAYEE, PAYEE] })).toMatchObject({
			after: expect.any(Object) as unknown,
			before: expect.any(Object) as unknown,
			removed: [PAYEE],
		});
	});
});

describe('coverage_gaps', () => {
	it('returns the list of gaps', () => {
		expect(run('coverage_gaps', {})).toEqual({ gaps: expect.any(Array) as unknown });
	});
});
