import { describe, expect, it } from 'vitest';
import { buildGraph, EDGE_SIZE, NODE_SIZE } from './buildGraph';
import { formatDate, formatKzt, formatKztCompact, formatScore } from './format';
import { buildIndex, counterparties, lookupGid } from './graphIndex';
import { ROLE_ORDER } from './roles';
import { SAMPLE_ANALYSIS } from './sampleAnalysis';

const index = buildIndex(SAMPLE_ANALYSIS);
const [consolidator] = SAMPLE_ANALYSIS.nodes.filter((node) => node.role === 'consolidator' && !node.truncated);

describe('gid lookup', () => {
	it('finds a gid as typed, and tolerates spaces from a spreadsheet', () => {
		const { gid } = consolidator!;
		const spaced = gid.replace(/(\d{3})(?=\d)/g, '$1 ');

		expect(lookupGid(index, gid)).toEqual({ gid, kind: 'found' });
		expect(lookupGid(index, spaced)).toEqual({ gid, kind: 'found' });
	});

	it('never goes through Number: a neighbouring 18-digit gid is a different client', () => {
		const { gid } = consolidator!;
		// Both round to the same double; only string comparison tells them apart.
		const neighbour = gid.slice(0, -1) + String((Number(gid.at(-1)) + 1) % 10);

		expect(Number(neighbour) === Number(gid)).toBe(true);
		expect(lookupGid(index, neighbour).kind).toBe('missing');
	});

	it('refuses what is not a gid', () => {
		expect(lookupGid(index, 'abc')).toEqual({ kind: 'invalid' });
		expect(lookupGid(index, '')).toEqual({ kind: 'invalid' });
	});
});

describe('counterparties', () => {
	it('lists the largest senders first, at most five', () => {
		const { topIn, topOut } = counterparties(index, consolidator!.gid);

		expect(topIn.length).toBe(5);
		expect(topIn.map((row) => row.sumKzt)).toEqual([...topIn.map((row) => row.sumKzt)].sort((a, b) => b - a));
		expect(topOut.length).toBe(consolidator!.outDeg);
	});
});

describe('the sigma graph', () => {
	const graph = buildGraph(SAMPLE_ANALYSIS);

	it('has every node and edge, with the precomputed positions', () => {
		const [node] = SAMPLE_ANALYSIS.nodes;

		expect(graph.order).toBe(SAMPLE_ANALYSIS.nodes.length);
		expect(graph.size).toBe(SAMPLE_ANALYSIS.edges.length);
		expect(graph.getNodeAttribute(node!.gid, 'x')).toBe(node!.x);
	});

	it('keeps sizes in range', () => {
		graph.forEachNode((_node, attributes) => {
			expect(attributes.size).toBeGreaterThanOrEqual(NODE_SIZE.min);
			expect(attributes.size).toBeLessThanOrEqual(NODE_SIZE.max);
		});
		graph.forEachEdge((_edge, attributes) => {
			expect(attributes.size).toBeGreaterThanOrEqual(EDGE_SIZE.min - 1e-9);
			expect(attributes.size).toBeLessThanOrEqual(EDGE_SIZE.max + 1e-9);
		});
	});

	it('skips an edge to a node that is not in the list rather than inventing one', () => {
		const broken = buildGraph({
			edges: [...SAMPLE_ANALYSIS.edges, { ...SAMPLE_ANALYSIS.edges[0]!, dst: '1' }],
			nodes: SAMPLE_ANALYSIS.nodes,
		});

		expect(broken.order).toBe(SAMPLE_ANALYSIS.nodes.length);
	});
});

describe('formatting', () => {
	it('groups KZT the way ru-RU does', () => {
		expect(formatKzt(1234567.6)).toBe('1 234 568 ₸');
		expect(formatKztCompact(1_234_567_890)).toBe('1,2 млрд ₸');
		expect(formatScore(0.905)).toMatch(/^0,9[01]$/);
		expect(formatDate('2026-07-01')).toBe('01.07.2026');
	});
});

describe('the legend order', () => {
	it('lists every role exactly once', () => {
		expect(new Set(ROLE_ORDER).size).toBe(6);
	});
});
