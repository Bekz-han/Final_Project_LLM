import { analysisSchema, ROLES } from '@server/graph/model/graph.schema';
import { describe, expect, it } from 'vitest';
import { SAMPLE_ANALYSIS } from './sampleAnalysis';

/**
 * The sample stands in for `output/analysis.json` until the pipeline lands. If it stops matching
 * the contract, the screen is being built against a shape the real data will not have.
 */
describe('the sample analysis', () => {
	it('parses with the frozen contract', () => {
		expect(() => analysisSchema.parse(SAMPLE_ANALYSIS)).not.toThrow();
	});

	it('covers all six roles, so the legend and colours are exercised', () => {
		const roles = new Set(SAMPLE_ANALYSIS.nodes.map((node) => node.role));

		expect([...roles].sort()).toEqual([...ROLES].sort());
	});

	it('has three clusters, and every node belongs to one of them', () => {
		const ids = new Set(SAMPLE_ANALYSIS.clusters.map((cluster) => cluster.clusterId));

		expect(ids.size).toBe(3);
		expect(SAMPLE_ANALYSIS.nodes.every((node) => ids.has(node.clusterId))).toBe(true);
	});

	it('carries seed and truncated flags', () => {
		const flags = SAMPLE_ANALYSIS.nodes.flatMap((node) => node.flags);

		expect(flags).toContain('seed');
		expect(flags).toContain('truncated');
	});

	it('uses gids above the safe-integer range, as the real data does', () => {
		const [first] = SAMPLE_ANALYSIS.nodes;

		expect(first?.gid).toHaveLength(18);
		expect(BigInt(first?.gid ?? '0') > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
	});

	it('only has edges between nodes that exist', () => {
		const gids = new Set(SAMPLE_ANALYSIS.nodes.map((node) => node.gid));

		expect(SAMPLE_ANALYSIS.edges.every((edge) => gids.has(edge.src) && gids.has(edge.dst))).toBe(true);
	});

	it('ranks at least five nodes, in order', () => {
		expect(SAMPLE_ANALYSIS.top.length).toBeGreaterThanOrEqual(5);
		expect(SAMPLE_ANALYSIS.top.map((row) => row.rank)).toEqual(SAMPLE_ANALYSIS.top.map((_row, i) => i + 1));
	});
});
