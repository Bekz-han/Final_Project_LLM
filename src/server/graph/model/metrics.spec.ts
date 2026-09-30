import { type RawGraph } from '@server/graph/model/graph.schema';
import { computeMetrics } from '@server/graph/model/metrics';
import { describe, expect, it } from 'vitest';

const graph: RawGraph = {
	edges: [
		{ depth: 1, dst: '2', nTx: 1, src: '1', sumKzt: 60 },
		{ depth: 1, dst: '2', nTx: 1, src: '1', sumKzt: 40 },
		{ depth: 2, dst: '3', nTx: 1, src: '2', sumKzt: 75 },
		{ depth: 2, dst: '4', nTx: 1, src: '2', sumKzt: 25 },
	],
	nodes: [
		{ depth: 0, gid: '1', isSeed: true },
		{ depth: 1, gid: '2', isSeed: false },
		{ depth: 2, gid: '3', isSeed: false },
		{ depth: 4, gid: '4', isSeed: false },
	],
	transactions: [
		{ date: '2026-07-01', dst: '2', src: '1', sumKzt: 100 },
		{ date: '2026-07-02', dst: '3', src: '2', sumKzt: 75 },
		{ date: '2026-07-05', dst: '4', src: '2', sumKzt: 25 },
	],
};

describe('computeMetrics', () => {
	it('computes distinct degrees, sums, seed reach and truncation without coercing gids', () => {
		const metrics = computeMetrics(graph);
		const transit = metrics.get('2')!;

		expect(transit).toMatchObject({
			fastTransitShare: 0.75,
			gid: '2',
			inDeg: 1,
			inKzt: 100,
			inTx: 2,
			outDeg: 2,
			outKzt: 100,
			outTx: 2,
			passThrough: 1,
			seedsUpstream: 1,
		});
		expect(metrics.get('4')).toMatchObject({ seedsUpstream: 1, truncated: true });
		expect(metrics.get('1')).toMatchObject({ seedsUpstream: 0 });
	});

	it('uses KZT weights for PageRank and networkx directed normalisation for Brandes', () => {
		const metrics = computeMetrics(graph);
		const rankSum = [...metrics.values()].reduce((sum, metric) => sum + metric.pagerank, 0);

		expect(rankSum).toBeCloseTo(1, 10);
		expect(metrics.get('3')!.pagerank).toBeGreaterThan(metrics.get('4')!.pagerank);
		expect(metrics.get('2')!.betweenness).toBeCloseTo(1 / 3, 10);
	});

	it('normalises HITS scores and leaves isolated-free scores finite', () => {
		const metrics = computeMetrics(graph);
		const hubSum = [...metrics.values()].reduce((sum, metric) => sum + metric.hub, 0);
		const authoritySum = [...metrics.values()].reduce((sum, metric) => sum + metric.authority, 0);

		expect(hubSum).toBeCloseTo(1, 10);
		expect(authoritySum).toBeCloseTo(1, 10);
		for (const metric of metrics.values()) {
			expect(Number.isFinite(metric.hub)).toBe(true);
			expect(Number.isFinite(metric.authority)).toBe(true);
		}
	});
});
