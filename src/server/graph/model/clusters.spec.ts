import { type NodeRow, type RawGraph } from '@server/graph/model/graph.schema';
import { describe, expect, it } from 'vitest';
import { detectClusters, summarizeClusters } from './clusters';

const graph: RawGraph = {
	edges: [
		{ depth: 1, dst: '2', nTx: 2, src: '1', sumKzt: 40 },
		{ depth: 1, dst: '1', nTx: 3, src: '2', sumKzt: 60 },
		{ depth: 1, dst: '5', nTx: 4, src: '4', sumKzt: 250 },
		{ depth: 1, dst: '4', nTx: 5, src: '5', sumKzt: 350 },
	],
	nodes: [
		{ depth: 0, gid: '1', isSeed: true },
		{ depth: 1, gid: '2', isSeed: false },
		{ depth: 0, gid: '4', isSeed: true },
		{ depth: 1, gid: '5', isSeed: false },
		{ depth: 0, gid: '7', isSeed: true },
	],
	transactions: [],
};

function node(gid: string, input: Pick<NodeRow, 'clusterId' | 'priorityScore' | 'role'>): NodeRow {
	const raw = graph.nodes.find((candidate) => candidate.gid === gid)!;

	return {
		authority: 0,
		betweenness: 0,
		clusterId: input.clusterId,
		depth: raw.depth,
		evidence: 'Тестовые наблюдаемые признаки.',
		fastTransitShare: 0,
		flags: [],
		gid,
		hub: 0,
		inDeg: 1,
		inKzt: 100,
		inTx: 1,
		isSeed: raw.isSeed,
		outDeg: 1,
		outKzt: 100,
		outTx: 1,
		pagerank: 0,
		passThrough: 1,
		priorityScore: input.priorityScore,
		role: input.role,
		roleScore: 0.8,
		seedsUpstream: 1,
		truncated: false,
		x: 0,
		y: 0,
	};
}

describe('detectClusters', () => {
	it('combines reciprocal flow, isolates disconnected nodes and gives the largest flow cluster id 0', () => {
		const clusters = detectClusters(graph);

		expect(clusters.get('4')).toBe(0);
		expect(clusters.get('5')).toBe(0);
		expect(clusters.get('1')).toBe(1);
		expect(clusters.get('2')).toBe(1);
		expect(clusters.get('7')).toBe(2);
	});

	it('is reproducible when input row order changes', () => {
		const reversed = { ...graph, edges: [...graph.edges].reverse(), nodes: [...graph.nodes].reverse() };

		expect([...detectClusters(reversed)]).toEqual([...detectClusters(graph)]);
	});
});

describe('summarizeClusters', () => {
	it('counts members, seeds and internal KZT and emits a cautious Russian hypothesis', () => {
		const nodes = [
			node('1', { clusterId: 1, priorityScore: 0.2, role: 'peripheral' }),
			node('2', { clusterId: 1, priorityScore: 0.9, role: 'consolidator' }),
			node('4', { clusterId: 0, priorityScore: 0.8, role: 'distributor' }),
			node('5', { clusterId: 0, priorityScore: 0.7, role: 'consolidator' }),
			node('7', { clusterId: 2, priorityScore: 0.1, role: 'peripheral' }),
		];
		const summaries = summarizeClusters(graph, nodes);

		expect(summaries.map((cluster) => cluster.clusterId)).toEqual([0, 1, 2]);
		expect(summaries[0]).toMatchObject({
			nNodes: 2,
			nSeed: 1,
			sumKztInternal: 600,
			topGids: ['4', '5'],
		});
		expect(summaries[0]?.hypothesis).toMatch(/^Гипотеза для проверки:/u);
		expect(summaries[0]?.hypothesis).toContain('консолидац');
		expect(summaries[0]?.hypothesis).toContain('распределен');
	});
});
