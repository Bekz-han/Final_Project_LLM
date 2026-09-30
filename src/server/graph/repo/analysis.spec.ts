import { type Analysis } from '@server/graph/model/graph.schema';
import { ANALYSIS_FILE, readAnalysis, resetAnalysisCache } from '@server/graph/repo/analysis';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The smallest object the contract accepts: one seed, no edges, one cluster, one top row. */
const MINIMAL: Analysis = {
	clusters: [
		{
			clusterId: 0,
			hypothesis: 'один изолированный seed',
			nNodes: 1,
			nSeed: 1,
			sumKztInternal: 0,
			topGids: ['100000000000000001'],
		},
	],
	edges: [],
	nodes: [
		{
			authority: 0,
			betweenness: 0,
			clusterId: 0,
			depth: 0,
			evidence: 'входящих 0, исходящих 0',
			fastTransitShare: 0,
			flags: ['seed'],
			gid: '100000000000000001',
			hub: 0,
			inDeg: 0,
			inKzt: 0,
			inTx: 0,
			isSeed: true,
			outDeg: 0,
			outKzt: 0,
			outTx: 0,
			pagerank: 1,
			passThrough: null,
			priorityScore: 0,
			role: 'peripheral',
			roleScore: 0,
			seedsUpstream: 0,
			truncated: false,
			x: 0,
			y: 0,
		},
	],
	stats: {
		edges: 0,
		nodes: 1,
		periodFrom: '2026-07-01',
		periodTo: '2026-07-31',
		seeds: 1,
		totalKzt: 0,
		transactions: 0,
	},
	thresholds: { consolidatorMinInDeg: 5 },
	top: [{ gid: '100000000000000001', priorityScore: 0, rank: 1, role: 'peripheral', why: 'единственный узел' }],
};

let dir: string;

function write(content: string, mtime?: Date): void {
	const path = join(dir, ANALYSIS_FILE);

	writeFileSync(path, content);

	if (mtime !== undefined) utimesSync(path, mtime, mtime);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'analysis-'));
	resetAnalysisCache();
});

afterEach(() => {
	rmSync(dir, { force: true, recursive: true });
});

describe('readAnalysis', () => {
	it('returns null when the pipeline has not run, so the screen can say so', () => {
		expect(readAnalysis(dir)).toBeNull();
	});

	it('returns the validated analysis when the file matches the contract', () => {
		write(JSON.stringify(MINIMAL));

		expect(readAnalysis(dir)).toEqual(MINIMAL);
	});

	it('throws on a file that is not JSON, naming the file and the fix', () => {
		write('{ not json');

		expect(() => readAnalysis(dir)).toThrow(/analysis\.json.*pnpm pipeline/s);
	});

	/**
	 * A gid that went through `Number` arrives as 1e17 and fails the digits regex. This is the
	 * bug the contract exists to catch, so the reader must refuse it rather than pass it on.
	 */
	it('throws on a file that breaks the contract, rather than handing bad rows to the screen', () => {
		const broken = { ...MINIMAL, nodes: [{ ...MINIMAL.nodes[0], gid: '1.0000000000000001e+17' }] };

		write(JSON.stringify(broken));

		expect(() => readAnalysis(dir)).toThrow(/nodes\.0\.gid/);
	});

	it('serves the cached object while the file is unchanged', () => {
		write(JSON.stringify(MINIMAL));

		const first = readAnalysis(dir);
		const second = readAnalysis(dir);

		expect(second).toBe(first);
	});

	it('re-reads the file when its modification time changes, so a pipeline re-run is picked up', () => {
		const earlier = new Date('2026-09-23T10:00:00.000Z');
		const later = new Date('2026-09-23T11:00:00.000Z');

		write(JSON.stringify(MINIMAL), earlier);
		expect(readAnalysis(dir)?.thresholds).toEqual({ consolidatorMinInDeg: 5 });

		write(JSON.stringify({ ...MINIMAL, thresholds: { consolidatorMinInDeg: 7 } }), later);
		expect(readAnalysis(dir)?.thresholds).toEqual({ consolidatorMinInDeg: 7 });
	});
});
