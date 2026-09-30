import { type NodeRow } from '@server/graph/model/graph.schema';
import { describe, expect, it } from 'vitest';
import { rankTop, scorePriority } from './priority';

function node(overrides: Partial<NodeRow> & Pick<NodeRow, 'gid'>): NodeRow {
	const { gid, ...rest } = overrides;

	return {
		authority: 0.2,
		betweenness: 0.5,
		clusterId: 1,
		depth: 2,
		evidence: 'Тестовые наблюдаемые признаки.',
		fastTransitShare: 0.4,
		flags: [],
		gid,
		hub: 0.3,
		inDeg: 5,
		inKzt: 700_000,
		inTx: 8,
		isSeed: false,
		outDeg: 2,
		outKzt: 300_000,
		outTx: 4,
		pagerank: 0.6,
		passThrough: 0.43,
		priorityScore: 0,
		role: 'consolidator',
		roleScore: 0.9,
		seedsUpstream: 4,
		truncated: false,
		x: 0,
		y: 0,
		...rest,
	};
}

describe('scorePriority', () => {
	it('scores every node in 0..1 and penalizes known seeds and truncated observations', () => {
		const actionable = node({ gid: '10' });
		const seed = node({ depth: 0, gid: '11', isSeed: true });
		const truncated = node({ depth: 4, flags: ['truncated'], gid: '12', truncated: true });
		const scores = scorePriority([actionable, seed, truncated]);

		expect(scores.get('10')).toBeGreaterThan(scores.get('12')!);
		expect(scores.get('12')).toBeGreaterThan(scores.get('11')!);
		for (const score of scores.values()) {
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
		}
	});

	it('uses seed density in the node cluster', () => {
		const dense = node({ clusterId: 1, gid: '20' });
		const denseSeed = node({ clusterId: 1, gid: '21', isSeed: true });
		const sparse = node({ clusterId: 2, gid: '22' });
		const sparsePeer = node({ clusterId: 2, gid: '23' });
		const scores = scorePriority([dense, denseSeed, sparse, sparsePeer]);

		expect(scores.get('20')).toBeGreaterThan(scores.get('22')!);
	});
});

describe('rankTop', () => {
	it('sorts by priority descending and then gid ascending', () => {
		const ranked = rankTop(
			[
				node({ gid: '20', priorityScore: 0.8 }),
				node({ gid: '3', priorityScore: 0.8 }),
				node({ gid: '1', priorityScore: 0.9 }),
			],
			2,
		);

		expect(ranked.map((row) => row.gid)).toEqual(['1', '3']);
		expect(ranked.map((row) => row.rank)).toEqual([1, 2]);
	});

	it('ranks unknown clients ahead of already known seeds', () => {
		const ranked = rankTop(
			[node({ gid: '1', isSeed: true, priorityScore: 0.99 }), node({ gid: '2', priorityScore: 0.1 })],
			2,
		);

		expect(ranked.map((row) => row.gid)).toEqual(['2', '1']);
	});

	it('explains two or three dominant numeric factors in Russian', () => {
		const [ranked] = rankTop([node({ gid: '30', priorityScore: 0.75 })], 1);
		const clauses = ranked!.why.split('; ');

		expect(clauses).toHaveLength(3);
		expect(ranked!.why).toMatch(/[А-Яа-яЁё]/u);
		expect(ranked!.why).toMatch(/\d/u);
		expect(ranked!.why).not.toMatch(/betweenness|depth/u);
	});
});
