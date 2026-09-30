import { type Analysis, type EdgeRow, type NodeRow } from '@server/graph/model/graph.schema';
import { coverageGaps, findCollectors, nodeCard, simulateRemoval, traceFlow } from '@server/graph/model/queries';
import { describe, expect, it } from 'vitest';

function node(gid: string, input: Partial<NodeRow> = {}): NodeRow {
	return {
		authority: 0,
		betweenness: 0,
		clusterId: 0,
		depth: 1,
		evidence: 'тестовые наблюдаемые признаки',
		fastTransitShare: 0,
		flags: [],
		gid,
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
		priorityScore: 0,
		role: 'peripheral',
		roleScore: 0,
		seedsUpstream: 0,
		truncated: false,
		x: 0,
		y: 0,
		...input,
	};
}

function edge(input: { dst: string; src: string; sumKzt?: number }): EdgeRow {
	return {
		depth: 1,
		dst: input.dst,
		firstDate: '2026-07-01',
		lastDate: '2026-07-02',
		nTx: 1,
		src: input.src,
		sumKzt: input.sumKzt ?? 100,
	};
}

function analysis(input: { edges: EdgeRow[]; nodes: NodeRow[] }): Analysis {
	return {
		clusters: [],
		edges: input.edges,
		nodes: input.nodes,
		stats: {
			edges: input.edges.length,
			nodes: input.nodes.length,
			periodFrom: '2026-07-01',
			periodTo: '2026-07-31',
			seeds: input.nodes.filter((item) => item.isSeed).length,
			totalKzt: input.edges.reduce((sum, item) => sum + item.sumKzt, 0),
			transactions: input.edges.reduce((sum, item) => sum + item.nTx, 0),
		},
		thresholds: {},
		top: [],
	};
}

const network = analysis({
	edges: [
		edge({ dst: '3', src: '1', sumKzt: 100 }),
		edge({ dst: '3', src: '2', sumKzt: 200 }),
		edge({ dst: '4', src: '3', sumKzt: 250 }),
	],
	nodes: [
		node('1', { depth: 0, isSeed: true }),
		node('2', { depth: 0, isSeed: true }),
		node('3', { role: 'consolidator' }),
		node('4', { depth: 4, role: 'terminal', truncated: true }),
	],
});

describe('findCollectors', () => {
	it('finds nodes reached from at least two supplied sources', () => {
		const collectors = findCollectors(network, { gids: ['1', '2'], maxHops: 2 });

		expect(collectors.map((collector) => collector.gid)).toEqual(['3', '4']);
		expect(collectors.find((collector) => collector.gid === '3')).toMatchObject({
			gid: '3',
			kztFromSources: 300,
			reachedFrom: 2,
			role: 'consolidator',
			sources: ['1', '2'],
		});
		expect(collectors.find((collector) => collector.gid === '4')?.kztFromSources).toBe(250);
	});

	it('respects the hop limit', () => {
		const collectors = findCollectors(network, { gids: ['1', '2'], maxHops: 1 });

		expect(collectors.map((collector) => collector.gid)).toEqual(['3']);
	});
});

describe('traceFlow', () => {
	it('traces downstream and upstream with the shortest hop for each node', () => {
		const down = traceFlow(network, { direction: 'down', gid: '1', maxHops: 2 });
		const up = traceFlow(network, { direction: 'up', gid: '4', maxHops: 2 });

		expect(down.nodes.map(({ gid, hop }) => [gid, hop])).toEqual([
			['1', 0],
			['3', 1],
			['4', 2],
		]);
		expect(up.nodes.map(({ gid, hop }) => [gid, hop])).toEqual([
			['4', 0],
			['3', 1],
			['1', 2],
			['2', 2],
		]);
	});

	it('returns an empty subgraph for an unknown gid', () => {
		expect(traceFlow(network, { direction: 'down', gid: '999', maxHops: 2 })).toMatchObject({
			edges: [],
			nodes: [],
		});
	});
});

describe('simulateRemoval', () => {
	it('reports the weak-component split caused by removing a bridge', () => {
		const impact = simulateRemoval(network, ['3']);

		expect(impact.before).toEqual({ components: 1, largest: 4, seedsInLargest: 2 });
		expect(impact.after).toEqual({ components: 3, largest: 1, seedsInLargest: 1 });
	});
});

describe('nodeCard', () => {
	it('keeps the five largest counterparties in descending KZT order', () => {
		const cardNetwork = analysis({
			edges: ['1', '2', '3', '4', '5', '6'].map((src) => edge({ dst: '9', src, sumKzt: Number(src) * 100 })),
			nodes: [...['1', '2', '3', '4', '5', '6'].map((gid) => node(gid)), node('9')],
		});

		expect(nodeCard(cardNetwork, '9')?.topIn.map((item) => item.gid)).toEqual(['6', '5', '4', '3', '2']);
		expect(nodeCard(cardNetwork, '999')).toBeNull();
	});
});

describe('coverageGaps', () => {
	it('quantifies truncation, incomplete seed history and the observation window', () => {
		const gaps = coverageGaps(network);

		expect(gaps.map((gap) => gap.affectedNodes)).toEqual([1, 2, 4]);
		expect(gaps.every((gap) => gap.nextRequest.length > 0)).toBe(true);
	});
});
