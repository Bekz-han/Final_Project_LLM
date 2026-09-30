import { type RawGraph } from '@server/graph/model/graph.schema';
import { auditRawGraph, hashInputs, INPUT_FILES, readRawGraph } from '@server/graph/repo/parquet';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SEED = '100000000000000001';
const PAYEE = '100000000000000002';
const SINK = '100000000000000003';

/** Consistent by construction: each edge is exactly the sum and count of its transactions. */
const CLEAN: RawGraph = {
	edges: [
		{ depth: 1, dst: PAYEE, nTx: 2, src: SEED, sumKzt: 30_000 },
		{ depth: 2, dst: SINK, nTx: 1, src: PAYEE, sumKzt: 25_000 },
	],
	nodes: [
		{ depth: 0, gid: SEED, isSeed: true },
		{ depth: 1, gid: PAYEE, isSeed: false },
		{ depth: 2, gid: SINK, isSeed: false },
	],
	transactions: [
		{ date: '2026-07-03', dst: PAYEE, src: SEED, sumKzt: 10_000 },
		{ date: '2026-07-10', dst: PAYEE, src: SEED, sumKzt: 20_000 },
		{ date: '2026-07-11', dst: SINK, src: PAYEE, sumKzt: 25_000 },
	],
};

describe('auditRawGraph', () => {
	it('finds no errors in a consistent graph', () => {
		expect(auditRawGraph(CLEAN).errors).toEqual([]);
	});

	it('fails on a gid that appears twice in nodes', () => {
		const raw = { ...CLEAN, nodes: [...CLEAN.nodes, { depth: 3, gid: PAYEE, isSeed: false }] };

		expect(auditRawGraph(raw).errors.join('\n')).toMatch(/more than once.*100000000000000002/);
	});

	it('fails on an edge whose endpoint is not in nodes', () => {
		const raw = { ...CLEAN, nodes: CLEAN.nodes.filter((node) => node.gid !== SINK) };

		expect(auditRawGraph(raw).errors.join('\n')).toMatch(/missing from nodes\.parquet.*100000000000000003/);
	});

	/**
	 * The organiser's starter asserts the same thing. If the two files disagree, one of them is not
	 * the file the other was built from, and every metric computed from them is fiction.
	 */
	it('fails when an edge does not add up to its transactions', () => {
		const raw = {
			...CLEAN,
			transactions: CLEAN.transactions.map((tx) => (tx.dst === SINK ? { ...tx, sumKzt: 24_000 } : tx)),
		};

		expect(auditRawGraph(raw).errors.join('\n')).toMatch(
			/disagree on 1 pair.*sum_kzt 25000 but transactions add up to 24000/,
		);
	});

	it('fails when a pair has transactions but no edge', () => {
		const raw = { ...CLEAN, edges: CLEAN.edges.filter((edge) => edge.dst !== SINK) };

		expect(auditRawGraph(raw).errors.join('\n')).toMatch(/has transactions but no edge/);
	});

	it('tolerates half a tiyn of floating-point drift in the sums', () => {
		const raw = {
			...CLEAN,
			transactions: CLEAN.transactions.map((tx) => (tx.dst === SINK ? { ...tx, sumKzt: 25_000.001 } : tx)),
		};

		expect(auditRawGraph(raw).errors).toEqual([]);
	});

	it('warns, and does not fail, on a seed count other than 81 — that is dataset-specific', () => {
		const audit = auditRawGraph(CLEAN);

		expect(audit.errors).toEqual([]);
		expect(audit.warnings.join('\n')).toMatch(/1 seed rows; the ТЗ dataset has 81/);
	});

	it('warns on depth-4 nodes with no outgoing transfers, the trap of the case', () => {
		const raw = {
			...CLEAN,
			nodes: CLEAN.nodes.map((node) => (node.gid === SINK ? { ...node, depth: 4 } : node)),
		};

		expect(auditRawGraph(raw).warnings.join('\n')).toMatch(/1 node\(s\) at depth 4 with no outgoing transfers/);
	});

	it('warns on a self-loop and on a seed that appears in no edge', () => {
		const loner = '100000000000000009';
		const raw: RawGraph = {
			edges: [...CLEAN.edges, { depth: 1, dst: SEED, nTx: 1, src: SEED, sumKzt: 5_000 }],
			nodes: [...CLEAN.nodes, { depth: 0, gid: loner, isSeed: true }],
			transactions: [...CLEAN.transactions, { date: '2026-07-20', dst: SEED, src: SEED, sumKzt: 5_000 }],
		};
		const warnings = auditRawGraph(raw).warnings.join('\n');

		expect(warnings).toMatch(/1 self-loop/);
		expect(warnings).toMatch(/1 seed\(s\) appear in no edge/);
	});
});

/**
 * The real files are committed (87 KB, must-have 1), so the reader is tested on them: this is the
 * only test that exercises ZSTD, the bigint → string and Date → ISO conversions on genuine input.
 */
describe('readRawGraph on the committed dataset', () => {
	const dataDir = resolve('data');

	it('reads 2 248 nodes, 3 119 edges and 4 840 transactions that reconcile', async () => {
		const raw = await readRawGraph(dataDir);

		expect(raw.nodes).toHaveLength(2248);
		expect(raw.edges).toHaveLength(3119);
		expect(raw.transactions).toHaveLength(4840);
		expect(raw.nodes.filter((node) => node.isSeed)).toHaveLength(81);
		expect(auditRawGraph(raw).errors).toEqual([]);
	});

	it('keeps every gid as an 18-digit string and every date as YYYY-MM-DD', async () => {
		const raw = await readRawGraph(dataDir);

		for (const node of raw.nodes) expect(node.gid).toMatch(/^\d{18}$/);
		for (const tx of raw.transactions) expect(tx.date).toMatch(/^2026-07-\d{2}$/);
	});

	it('hashes each input file with SHA-256, the same way every time', () => {
		const first = hashInputs(dataDir);
		const second = hashInputs(dataDir);

		expect(Object.keys(first)).toEqual([...INPUT_FILES]);
		for (const hash of Object.values(first)) expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(second).toEqual(first);
	});
});
