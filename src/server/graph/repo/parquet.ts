import { type RawGraph, rawGraphSchema } from '@server/graph/model/graph.schema';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'server-only';

/**
 * Reads `nodes.parquet`, `edges.parquet` and `transactions.parquet` into a `RawGraph`, and refuses
 * an inconsistent one.
 *
 * Only the pipeline calls this. The application reads `analysis.json` instead, so this is the one
 * place that knows the files' column names and physical types. Two conversions here are the ones
 * that silently corrupt the result if done anywhere else:
 *
 * - A gid is INT64 around 1e17, above `Number.MAX_SAFE_INTEGER`. hyparquet returns it as a
 *   `bigint`; it becomes a string here and is never a number again. `Number(gid)` merges distinct
 *   clients, and the schema's digit regex is what catches it if somebody tries.
 * - A DATE arrives as a UTC-midnight `Date`. The calendar date is the ISO prefix; formatting it in
 *   local time moves every transaction to the previous day west of Greenwich.
 *
 * The files are ZSTD-compressed. hyparquet alone speaks only snappy, hence `hyparquet-compressors`.
 *
 * Validation is in two layers. `rawGraphSchema` checks every row's shape and range. `auditRawGraph`
 * checks the relations between rows — the invariants the analytics owner listed in `graph/data/ANALYTICS.md`,
 * which the lead assigned to this reader (`docs/plan.md`, Requests 15:25). Errors stop the run
 * before anything is computed; warnings are declared properties of this dataset, printed by the
 * CLI and kept in the run summary.
 *
 * Measured on the real data: all three files in about 44 ms.
 */

export const INPUT_FILES = ['nodes.parquet', 'edges.parquet', 'transactions.parquet'] as const;

export interface RawGraphAudit {
	/** Any of these and the pipeline stops before computing anything. */
	errors: string[];
	/** Printed and recorded, never fatal: the dataset is documented to look like this. */
	warnings: string[];
}

/**
 * The ТЗ dataset has 81 seeds. Another count is a warning, not an error — that is dataset-specific
 * — but a wrong file looks exactly like this, so it is worth a line.
 */
const EXPECTED_SEEDS = 81;

/** Half a tiyn. The transactions behind an edge must add up to it to the cent. */
const AMOUNT_TOLERANCE = 0.005;

type Row = Record<string, unknown>;

async function readTable(dataDir: string, file: string): Promise<Row[]> {
	const buffer = await asyncBufferFromFile(join(dataDir, file));

	return parquetReadObjects({ compressors, file: buffer });
}

function gid(value: unknown, column: string): string {
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);

	throw new TypeError(`${column}: expected an integer id, got ${typeof value}`);
}

/** Small integers — depth, n_tx — arrive as bigint (INT64) or number (INT32) depending on the column. */
function int(value: unknown, column: string): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);

	throw new TypeError(`${column}: expected an integer, got ${typeof value}`);
}

function kzt(value: unknown, column: string): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'bigint') return Number(value);

	throw new TypeError(`${column}: expected an amount, got ${typeof value}`);
}

function bool(value: unknown, column: string): boolean {
	if (typeof value === 'boolean') return value;

	throw new TypeError(`${column}: expected a boolean, got ${typeof value}`);
}

function isoDate(value: unknown, column: string): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === 'string') return value.slice(0, 10);

	throw new TypeError(`${column}: expected a date, got ${typeof value}`);
}

// --- the audit -----------------------------------------------------------------------------------

function findErrors(raw: RawGraph): string[] {
	const errors: string[] = [];

	if (raw.nodes.length === 0) errors.push('nodes.parquet is empty.');
	if (raw.edges.length === 0) errors.push('edges.parquet is empty.');
	if (raw.transactions.length === 0) errors.push('transactions.parquet is empty.');

	const known = new Set<string>();
	const duplicates: string[] = [];

	for (const node of raw.nodes) {
		if (known.has(node.gid)) duplicates.push(node.gid);
		known.add(node.gid);
	}

	if (duplicates.length > 0) {
		errors.push(`${duplicates.length} gid(s) appear more than once in nodes.parquet, e.g. ${duplicates[0] ?? ''}.`);
	}

	const dangling = new Set<string>();

	for (const { dst, src } of [...raw.edges, ...raw.transactions]) {
		if (!known.has(src)) dangling.add(src);
		if (!known.has(dst)) dangling.add(dst);
	}

	if (dangling.size > 0) {
		errors.push(
			`${dangling.size} endpoint(s) of edges or transactions are missing from nodes.parquet, e.g. ${[...dangling][0] ?? ''}.`,
		);
	}

	const nonPositive = [...raw.edges, ...raw.transactions].filter((row) => row.sumKzt <= 0).length;

	if (nonPositive > 0) errors.push(`${nonPositive} row(s) carry a non-positive amount.`);

	// Every edge is the aggregate of its transactions. If they disagree, one of the two files is
	// not the one the other was built from, and no metric computed from them means anything.
	const byPair = new Map<string, { count: number; sum: number }>();

	for (const tx of raw.transactions) {
		const key = `${tx.src}→${tx.dst}`;
		const acc = byPair.get(key) ?? { count: 0, sum: 0 };

		acc.count += 1;
		acc.sum += tx.sumKzt;
		byPair.set(key, acc);
	}

	const mismatched: string[] = [];

	for (const edge of raw.edges) {
		const key = `${edge.src}→${edge.dst}`;
		const agg = byPair.get(key);

		if (agg === undefined) {
			mismatched.push(`${key} has no transactions`);
		} else if (agg.count !== edge.nTx) {
			mismatched.push(`${key}: n_tx ${edge.nTx} but ${agg.count} transactions`);
		} else if (Math.abs(agg.sum - edge.sumKzt) > AMOUNT_TOLERANCE) {
			mismatched.push(`${key}: sum_kzt ${edge.sumKzt} but transactions add up to ${agg.sum}`);
		}

		byPair.delete(key);
	}

	for (const key of byPair.keys()) mismatched.push(`${key} has transactions but no edge`);

	if (mismatched.length > 0) {
		errors.push(
			`edges.parquet and transactions.parquet disagree on ${mismatched.length} pair(s), e.g. ${mismatched[0] ?? ''}.`,
		);
	}

	return errors;
}

function findWarnings(raw: RawGraph): string[] {
	const warnings: string[] = [];
	const seeds = raw.nodes.filter((node) => node.isSeed).length;

	if (seeds !== EXPECTED_SEEDS) warnings.push(`${seeds} seed rows; the ТЗ dataset has ${EXPECTED_SEEDS}.`);

	const selfLoops = raw.edges.filter((edge) => edge.src === edge.dst).length;

	if (selfLoops > 0) warnings.push(`${selfLoops} self-loop edge(s): a client paying itself.`);

	const touched = new Set<string>();
	const inKzt = new Map<string, number>();
	const outKzt = new Map<string, number>();
	const outDeg = new Map<string, number>();

	for (const edge of raw.edges) {
		touched.add(edge.src).add(edge.dst);
		inKzt.set(edge.dst, (inKzt.get(edge.dst) ?? 0) + edge.sumKzt);
		outKzt.set(edge.src, (outKzt.get(edge.src) ?? 0) + edge.sumKzt);
		outDeg.set(edge.src, (outDeg.get(edge.src) ?? 0) + 1);
	}

	const isolatedSeeds = raw.nodes.filter((node) => node.isSeed && !touched.has(node.gid)).length;

	if (isolatedSeeds > 0) {
		warnings.push(`${isolatedSeeds} seed(s) appear in no edge; they stay in the output as isolated nodes.`);
	}

	const overspending = raw.nodes.filter((node) => (outKzt.get(node.gid) ?? 0) > (inKzt.get(node.gid) ?? 0)).length;

	if (overspending > 0) {
		warnings.push(
			`${overspending} node(s) send more than they are observed to receive: transfers from outside the sample are not in the data, so pass-through is unreliable for them.`,
		);
	}

	const truncated = raw.nodes.filter((node) => node.depth === 4 && (outDeg.get(node.gid) ?? 0) === 0).length;

	if (truncated > 0) {
		warnings.push(
			`${truncated} node(s) at depth 4 with no outgoing transfers: the traversal stopped there, the money may not have. Never 'terminal'.`,
		);
	}

	return warnings;
}

/** Pure, so the invariants can be tested on a hand-built graph without a parquet file in sight. */
export function auditRawGraph(raw: RawGraph): RawGraphAudit {
	return { errors: findErrors(raw), warnings: findWarnings(raw) };
}

// --- reading -------------------------------------------------------------------------------------

export async function readRawGraph(dataDir: string): Promise<RawGraph> {
	const nodes = await readTable(dataDir, 'nodes.parquet');
	const edges = await readTable(dataDir, 'edges.parquet');
	const transactions = await readTable(dataDir, 'transactions.parquet');

	// The schema is the first word: a file with a missing column or a negative amount fails here,
	// with the row and the field named, rather than three functions later as a NaN in a CSV.
	const raw = rawGraphSchema.parse({
		edges: edges.map((row) => ({
			depth: int(row.depth, 'edges.depth'),
			dst: gid(row.dst, 'edges.dst'),
			nTx: int(row.n_tx, 'edges.n_tx'),
			src: gid(row.src, 'edges.src'),
			sumKzt: kzt(row.sum_kzt, 'edges.sum_kzt'),
		})),
		nodes: nodes.map((row) => ({
			depth: int(row.depth, 'nodes.depth'),
			gid: gid(row.gid, 'nodes.gid'),
			isSeed: bool(row.is_seed, 'nodes.is_seed'),
		})),
		transactions: transactions.map((row) => ({
			date: isoDate(row.date, 'transactions.date'),
			dst: gid(row.dst, 'transactions.dst'),
			src: gid(row.src, 'transactions.src'),
			sumKzt: kzt(row.sum_kzt, 'transactions.sum_kzt'),
		})),
	});

	const { errors } = auditRawGraph(raw);

	if (errors.length > 0) {
		throw new Error(`${dataDir}: the input is not consistent.\n${errors.map((error) => `  - ${error}`).join('\n')}`);
	}

	return raw;
}

/**
 * SHA-256 of each input file, for the run summary. Two runs with the same hashes ran on the same
 * data whatever the files were called, and a jury member can check that against the archive.
 */
export function hashInputs(dataDir: string): Record<string, string> {
	return Object.fromEntries(
		INPUT_FILES.map((file) => [
			file,
			createHash('sha256')
				.update(readFileSync(join(dataDir, file)))
				.digest('hex'),
		]),
	);
}
