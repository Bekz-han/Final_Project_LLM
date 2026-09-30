import { type RawGraph } from '@server/graph/model/graph.schema';
import { readAnalysis, resetAnalysisCache } from '@server/graph/repo/analysis';
import { CLUSTERS_FILE, NODES_FILE, TOP_FILE, writeOutputs } from '@server/graph/repo/outputs';
import { analyze } from '@server/graph/usecase/analyze';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * A four-node graph: the seed pays `payee` twice and `side` once, `payee` pays `sink`. `sink` is
 * at depth 2 with no outgoing transfers. Small enough to reason about by hand, shaped enough to
 * exercise every stage.
 */
const SEED = '100000000000000001';
const PAYEE = '100000000000000002';
const SIDE = '100000000000000003';
const SINK = '100000000000000004';

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

describe('analyze', () => {
	it('gives every node a row with a role, a cluster, a priority and a position', () => {
		const analysis = analyze(RAW);

		expect(analysis.nodes.map((node) => node.gid)).toEqual([SEED, PAYEE, SIDE, SINK]);

		for (const node of analysis.nodes) {
			expect(node.evidence.length).toBeGreaterThan(0);
			expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
			expect(node.priorityScore).toBeGreaterThanOrEqual(0);
			expect(node.priorityScore).toBeLessThanOrEqual(1);
		}
	});

	it('dates every edge from its transactions, first to last', () => {
		const { edges } = analyze(RAW);

		expect(edges.find((edge) => edge.src === SEED && edge.dst === PAYEE)).toMatchObject({
			firstDate: '2026-07-03',
			lastDate: '2026-07-10',
		});
		expect(edges.find((edge) => edge.src === PAYEE && edge.dst === SINK)).toMatchObject({
			firstDate: '2026-07-11',
			lastDate: '2026-07-11',
		});
	});

	it('summarises the dataset: counts, seeds, turnover and period', () => {
		expect(analyze(RAW).stats).toEqual({
			edges: 3,
			nodes: 4,
			periodFrom: '2026-07-03',
			periodTo: '2026-07-11',
			seeds: 1,
			totalKzt: 62_000,
			transactions: 4,
		});
	});

	it('exports the role thresholds, so the README and the screen show the numbers actually applied', () => {
		expect(Object.keys(analyze(RAW).thresholds).length).toBeGreaterThan(0);
	});

	/**
	 * The layout is stored, not recomputed, so that the picture is the same on every run. A layout
	 * that drifted between two runs on identical input would make a rehearsed demo unrehearsable.
	 */
	it('is deterministic: the same input gives the same positions', () => {
		const first = analyze(RAW).nodes.map((node) => [node.x, node.y]);
		const second = analyze(RAW).nodes.map((node) => [node.x, node.y]);

		expect(second).toEqual(first);
	});

	it('refuses an edge with no transactions behind it, naming the pair', () => {
		const inconsistent = { ...RAW, transactions: RAW.transactions.filter((tx) => tx.dst !== SINK) };

		expect(() => analyze(inconsistent)).toThrow(new RegExp(`${PAYEE} → ${SINK}`));
	});
});

describe('writeOutputs → readAnalysis', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'outputs-'));
		resetAnalysisCache();
	});

	afterEach(() => {
		rmSync(dir, { force: true, recursive: true });
	});

	/** This is the test that keeps the two spellings of `analysis.json` from drifting apart. */
	it('round-trips: what the pipeline writes is exactly what the application reads back', () => {
		const analysis = analyze(RAW);

		writeOutputs(dir, analysis);

		expect(readAnalysis(dir)).toEqual(analysis);
	});

	it('writes the three CSVs with the ТЗ columns first, in its order, and one line per row', () => {
		const analysis = analyze(RAW);

		writeOutputs(dir, analysis);

		const nodes = readFileSync(join(dir, NODES_FILE), 'utf8').split('\n');
		const clusters = readFileSync(join(dir, CLUSTERS_FILE), 'utf8').split('\n');
		const top = readFileSync(join(dir, TOP_FILE), 'utf8').split('\n');

		expect(nodes[0]?.startsWith('gid,role,role_score,cluster_id,priority_score,evidence')).toBe(true);
		expect(nodes.filter((text) => text.length > 0)).toHaveLength(1 + analysis.nodes.length);
		expect(nodes[1]?.startsWith(`${SEED},`)).toBe(true);

		expect(clusters[0]).toBe('cluster_id,n_nodes,n_seed,sum_kzt_internal,top_gids,hypothesis');
		expect(clusters.filter((text) => text.length > 0)).toHaveLength(1 + analysis.clusters.length);

		expect(top[0]).toBe('rank,gid,role,priority_score,why');
		expect(top.filter((text) => text.length > 0)).toHaveLength(1 + analysis.top.length);
	});
});
