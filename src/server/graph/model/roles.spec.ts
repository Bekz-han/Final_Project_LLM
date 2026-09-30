import { type NodeMetrics, type RawGraph, roleVerdictSchema } from '@server/graph/model/graph.schema';
import { assignRoles } from '@server/graph/model/roles';
import { describe, expect, it } from 'vitest';

function metric(overrides: Partial<NodeMetrics> & Pick<NodeMetrics, 'gid'>): NodeMetrics {
	return {
		authority: 0,
		betweenness: 0,
		depth: 2,
		fastTransitShare: 0,
		hub: 0,
		inDeg: 0,
		inKzt: 0,
		inTx: 0,
		isSeed: false,
		outDeg: 0,
		outKzt: 0,
		outTx: 0,
		pagerank: 0,
		passThrough: null,
		seedsUpstream: 0,
		truncated: false,
		...overrides,
	};
}

function raw(gids: string[], edges: RawGraph['edges'] = []): RawGraph {
	return {
		edges,
		nodes: gids.map((gid) => ({ depth: 2, gid, isSeed: false })),
		transactions: [],
	};
}

function roleFor(graph: RawGraph, input: { gid: string; metrics: NodeMetrics[] }): string {
	return assignRoles(graph, new Map(input.metrics.map((item) => [item.gid, item]))).get(input.gid)!.role;
}

describe('assignRoles', () => {
	it('assigns coordinator when an early node reaches many targets through independent branches', () => {
		const targetGids = Array.from({ length: 15 }, (_, index) => String(index + 10));
		const coordinator = metric({ depth: 1, gid: '1', outDeg: 3 });
		const branches = ['2', '3', '4'].map((gid) => metric({ gid, outDeg: 4 }));
		const targets = targetGids.map((gid) => metric({ gid, inDeg: 5, inKzt: 100_000, passThrough: 0.1 }));
		const edges: RawGraph['edges'] = [
			...['2', '3', '4'].map((dst) => ({ depth: 1 as const, dst, nTx: 1, src: '1', sumKzt: 1 })),
			...targetGids.map((dst, index) => ({
				depth: 2 as const,
				dst,
				nTx: 1,
				src: String(2 + (index % 3)),
				sumKzt: 1,
			})),
		];
		const graph = raw(['1', '2', '3', '4', ...targetGids], edges);

		expect(roleFor(graph, { gid: '1', metrics: [coordinator, ...branches, ...targets] })).toBe('coordinator');
	});

	it('does not call a one-branch pass-through node a coordinator', () => {
		const targetGids = Array.from({ length: 15 }, (_, index) => String(index + 10));
		const source = metric({ depth: 1, gid: '1', inDeg: 1, outDeg: 3, passThrough: 1 });
		const branch = metric({ gid: '2', outDeg: 10 });
		const targets = targetGids.map((gid) => metric({ gid, inDeg: 5, passThrough: 0.1 }));
		const graph = raw(
			['1', '2', '3', '4', ...targetGids],
			[
				{ depth: 1, dst: '2', nTx: 1, src: '1', sumKzt: 1 },
				{ depth: 1, dst: '3', nTx: 1, src: '1', sumKzt: 1 },
				{ depth: 1, dst: '4', nTx: 1, src: '1', sumKzt: 1 },
				...targetGids.map((dst) => ({ depth: 2 as const, dst, nTx: 1, src: '2', sumKzt: 1 })),
			],
		);

		expect(roleFor(graph, { gid: '1', metrics: [source, branch, ...targets] })).not.toBe('coordinator');
	});

	it.each([
		['distributor', metric({ gid: '10', inDeg: 2, outDeg: 10, outKzt: 500_000 })],
		['consolidator', metric({ gid: '11', inDeg: 5, inKzt: 500_000, outDeg: 1, outKzt: 100_000, passThrough: 0.2 })],
		[
			'transit',
			metric({
				fastTransitShare: 0.8,
				gid: '12',
				inDeg: 1,
				inKzt: 100_000,
				outDeg: 1,
				outKzt: 100_000,
				passThrough: 1,
			}),
		],
		['terminal', metric({ gid: '13', inDeg: 1, inKzt: 200_000 })],
		['peripheral', metric({ gid: '14', inDeg: 1, inKzt: 1_000 })],
	] as const)('assigns the %s role from its numeric rule', (expected, nodeMetric) => {
		expect(roleFor(raw([nodeMetric.gid]), { gid: nodeMetric.gid, metrics: [nodeMetric] })).toBe(expected);
	});

	it('rejects consolidators that forward at least half of observed inflow', () => {
		const forwardsAll = metric({ gid: '15', inDeg: 8, inKzt: 100_000, outDeg: 1, outKzt: 850_000, passThrough: 8.5 });

		expect(roleFor(raw(['15']), { gid: '15', metrics: [forwardsAll] })).not.toBe('consolidator');
	});

	it('reports direct seed payers rather than all upstream seeds', () => {
		const graph: RawGraph = {
			edges: [
				{ depth: 1, dst: '2', nTx: 1, src: '1', sumKzt: 10 },
				{ depth: 2, dst: '3', nTx: 1, src: '2', sumKzt: 10 },
			],
			nodes: [
				{ depth: 0, gid: '1', isSeed: true },
				{ depth: 1, gid: '2', isSeed: false },
				{ depth: 2, gid: '3', isSeed: false },
			],
			transactions: [],
		};
		const collector = metric({ gid: '3', inDeg: 5, passThrough: 0.1, seedsUpstream: 12 });
		const verdict = assignRoles(graph, new Map([['3', collector]])).get('3')!;

		expect(verdict.evidence).toContain('прямых seed: 0');
		expect(verdict.evidence).not.toContain('12 seed');
	});

	it('keeps scores below one for nodes that only narrowly clear a threshold', () => {
		const distributor = metric({ gid: '16', inDeg: 2, outDeg: 11, outKzt: 500_000 });
		const verdict = assignRoles(raw(['16']), new Map([['16', distributor]])).get('16')!;

		expect(verdict.role).toBe('distributor');
		expect(verdict.roleScore).toBeGreaterThan(0);
		expect(verdict.roleScore).toBeLessThan(1);
	});

	it('flags a depth-four sink, caps its score and never calls it terminal', () => {
		const truncated = metric({ depth: 4, gid: '20', inDeg: 1, inKzt: 500_000, truncated: true });
		const verdict = assignRoles(raw(['20']), new Map([['20', truncated]])).get('20')!;

		expect(verdict.role).toBe('peripheral');
		expect(verdict.flags).toContain('truncated');
		expect(verdict.roleScore).toBeLessThanOrEqual(0.5);
		expect(verdict.evidence).toContain('обход остановлен на 4-м колене');
	});

	it('does not use a seed pass-through ratio to assign transit', () => {
		const seed = metric({
			gid: '30',
			inDeg: 1,
			inKzt: 100_000,
			isSeed: true,
			outDeg: 1,
			outKzt: 100_000,
			passThrough: 1,
		});

		expect(roleFor(raw(['30']), { gid: '30', metrics: [seed] })).toBe('peripheral');
	});

	it('explains why a small observed sink stays peripheral', () => {
		const smallSink = metric({ gid: '31', inDeg: 1, inKzt: 17_144 });
		const verdict = assignRoles(raw(['31']), new Map([['31', smallSink]])).get('31')!;

		expect(verdict.evidence).toContain('плательщиков 1 (нужно ≥ 2)');
		expect(verdict.evidence).toContain('нужно ≥ 200 000 KZT');
	});

	it('names an isolated seed explicitly', () => {
		const isolated = metric({ depth: 0, gid: '32', isSeed: true });
		const verdict = assignRoles(raw(['32']), new Map([['32', isolated]])).get('32')!;

		expect(verdict.evidence).toContain('seed без переводов в выборке');
	});

	it('keeps every verdict schema-valid, concise and numeric', () => {
		const nodes = [
			metric({ gid: '40', inDeg: 1, inKzt: 50_000 }),
			metric({ fastTransitShare: 1, gid: '41', inDeg: 1, inKzt: 10_000, outDeg: 1, outKzt: 10_000, passThrough: 1 }),
		];

		for (const verdict of assignRoles(raw(['40', '41']), new Map(nodes.map((node) => [node.gid, node]))).values()) {
			expect(() => roleVerdictSchema.parse(verdict)).not.toThrow();
			expect(verdict.evidence).toMatch(/\d/);
			expect(verdict.evidence.length).toBeLessThanOrEqual(200);
		}
	});
});
