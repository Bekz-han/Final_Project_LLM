import { type Analysis, type EdgeRow, type NodeRow } from '@server/graph/model/graph.schema';
import { describe, expect, it } from 'vitest';
import { buildMoneyPath } from './moneyPath';

// Long enough that Number() would collide them; the path must never go through a number.
const SEED = '900000000000000001';
const FIRST = '900000000000000002';
const SECOND = '900000000000000003';
const TARGET = '900000000000000004';

function node(gid: string, isSeed = false): NodeRow {
	return { gid, isSeed } as NodeRow;
}

function edge(pair: string, sumKzt: number): EdgeRow {
	const [src, dst] = pair.split('>') as [string, string];

	return { depth: 1, dst, firstDate: '2024-01-01', lastDate: '2024-01-02', nTx: 1, src, sumKzt };
}

function analysis(nodes: NodeRow[], edges: EdgeRow[]): Pick<Analysis, 'edges' | 'nodes'> {
	return { edges, nodes };
}

describe('buildMoneyPath', () => {
	const chain = analysis(
		[node(SEED, true), node(FIRST), node(SECOND), node(TARGET)],
		[edge(`${SEED}>${FIRST}`, 300), edge(`${FIRST}>${SECOND}`, 200), edge(`${SECOND}>${TARGET}`, 100)],
	);

	it('walks a chain seed → a → b → target hop by hop', () => {
		const path = buildMoneyPath(chain, { gid: TARGET })!;

		expect(Object.fromEntries(path.hops)).toEqual({ [FIRST]: 2, [SECOND]: 1, [SEED]: 3, [TARGET]: 0 });
		expect(path.maxHop).toBe(3);
		expect(path.seedsReached).toEqual([SEED]);
		expect(path.edges).toEqual(new Set([`${FIRST}|${SECOND}`, `${SECOND}|${TARGET}`, `${SEED}|${FIRST}`]));
		expect(path.totalKzt).toBe(100);
	});

	it('keeps gids as strings, character for character', () => {
		const path = buildMoneyPath(chain, { gid: TARGET })!;

		for (const gid of path.hops.keys()) expect(typeof gid).toBe('string');
		expect(path.target).toBe(TARGET);
		expect(path.hops.has(String(Number(SEED)))).toBe(false);
	});

	it('does not climb past a seed', () => {
		const upstream = '900000000000000009';
		const withSender = analysis([...chain.nodes, node(upstream)], [...chain.edges, edge(`${upstream}>${SEED}`, 999)]);

		expect(buildMoneyPath(withSender, { gid: TARGET })!.hops.has(upstream)).toBe(false);
	});

	it('keeps only the strongest senders per node', () => {
		const senders = Array.from({ length: 12 }, (_slot, i) => `8000000000000000${String(i).padStart(2, '0')}`);
		const fan = analysis(
			[node(TARGET), ...senders.map((gid) => node(gid))],
			senders.map((gid, i) => edge(`${gid}>${TARGET}`, i + 1)),
		);
		const path = buildMoneyPath(fan, { gid: TARGET, maxEdgesPerHop: 3 })!;

		expect([...path.hops.keys()].sort()).toEqual([senders[9], senders[10], senders[11], TARGET].sort());
		expect(path.edges.size).toBe(3);
		expect(path.seedsReached).toEqual([]);
		expect(path.totalKzt).toBe(10 + 11 + 12);
	});

	it('returns only the target for a node nobody sends to', () => {
		const path = buildMoneyPath(chain, { gid: SEED })!;

		expect(Object.fromEntries(path.hops)).toEqual({ [SEED]: 0 });
		expect(path.edges.size).toBe(0);
		expect(path.maxHop).toBe(0);
	});

	it('prunes branches that lead to no seed when a seed is reached', () => {
		const stray = '900000000000000007';
		const branched = analysis([...chain.nodes, node(stray)], [...chain.edges, edge(`${stray}>${TARGET}`, 50)]);
		const path = buildMoneyPath(branched, { gid: TARGET })!;

		expect(path.hops.has(stray)).toBe(false);
		expect(path.totalKzt).toBe(100);
	});

	it('returns null for a gid not in the analysis', () => {
		expect(buildMoneyPath(chain, { gid: '1' })).toBeNull();
	});
});
