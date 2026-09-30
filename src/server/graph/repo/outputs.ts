import { type Analysis, type ClusterRow, type NodeRow, type TopRow } from '@server/graph/model/graph.schema';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'server-only';

/**
 * Writes the three CSVs the ТЗ requires, plus `analysis.json` for the application.
 *
 * The CSV schemas are checked mechanically by the jury, so the required columns come first and in
 * the ТЗ's order; our own metrics follow them, which the organiser's README explicitly permits.
 * Gids are written as plain digits (the ТЗ types the column int64), booleans as `true`/`false`,
 * a missing value as an empty cell, and a list — `top_gids`, `flags` — joined with `|`, the
 * separator the lead fixed in `docs/plan.md` (Requests, 15:25), so a cell never needs a nested
 * delimiter.
 *
 * The JSON is the same `Analysis` object, verbatim. The reader in `./analysis.ts` validates it
 * against the contract on the way back in; `scripts/pipeline.ts` does that round trip once after
 * every run, which is what keeps the two file names below from drifting apart.
 */

export const NODES_FILE = 'nodes_roles.csv';
export const CLUSTERS_FILE = 'clusters.csv';
export const TOP_FILE = 'top_nodes.csv';
/** Must equal `ANALYSIS_FILE` in `./analysis.ts`. A repo may not import a sibling repo, so it is spelled twice. */
const ANALYSIS_FILE = 'analysis.json';

type Cell = string[] | boolean | number | string | null;

/** One column: its header and how to read it off a row. Header and value cannot drift apart. */
type Column<T> = readonly [name: string, pick: (row: T) => Cell];

const score = (value: number): number => Math.round(value * 1e4) / 1e4;
const money = (value: number): number => Math.round(value * 100) / 100;
const fine = (value: number): number => Number(value.toPrecision(6));

const NODE_COLUMNS: readonly Column<NodeRow>[] = [
	// --- required by the ТЗ, in its order ---
	['gid', (node) => node.gid],
	['role', (node) => node.role],
	['role_score', (node) => score(node.roleScore)],
	['cluster_id', (node) => node.clusterId],
	['priority_score', (node) => score(node.priorityScore)],
	['evidence', (node) => node.evidence],
	// --- ours ---
	['depth', (node) => node.depth],
	['is_seed', (node) => node.isSeed],
	['truncated', (node) => node.truncated],
	['flags', (node) => node.flags],
	['in_deg', (node) => node.inDeg],
	['out_deg', (node) => node.outDeg],
	['in_kzt', (node) => money(node.inKzt)],
	['out_kzt', (node) => money(node.outKzt)],
	['in_tx', (node) => node.inTx],
	['out_tx', (node) => node.outTx],
	['pass_through', (node) => (node.passThrough === null ? null : score(node.passThrough))],
	['seeds_upstream', (node) => node.seedsUpstream],
	['fast_transit_share', (node) => score(node.fastTransitShare)],
	['pagerank', (node) => fine(node.pagerank)],
	['hub', (node) => fine(node.hub)],
	['authority', (node) => fine(node.authority)],
	['betweenness', (node) => fine(node.betweenness)],
];

const CLUSTER_COLUMNS: readonly Column<ClusterRow>[] = [
	['cluster_id', (cluster) => cluster.clusterId],
	['n_nodes', (cluster) => cluster.nNodes],
	['n_seed', (cluster) => cluster.nSeed],
	['sum_kzt_internal', (cluster) => money(cluster.sumKztInternal)],
	['top_gids', (cluster) => cluster.topGids],
	['hypothesis', (cluster) => cluster.hypothesis],
];

const TOP_COLUMNS: readonly Column<TopRow>[] = [
	['rank', (row) => row.rank],
	['gid', (row) => row.gid],
	['role', (row) => row.role],
	['priority_score', (row) => score(row.priorityScore)],
	['why', (row) => row.why],
];

/** RFC 4180: quote a field that holds the delimiter, a quote or a line break; double the quotes inside. */
function quote(text: string): string {
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cell(value: Cell): string {
	if (value === null) return '';
	if (Array.isArray(value)) return quote(value.join('|'));
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);

	return quote(value);
}

/** Header row, then one line per row. LF line endings, UTF-8, no BOM: what pandas and the jury read. */
export function toCsv<T>(columns: readonly Column<T>[], rows: readonly T[]): string {
	const header = columns.map(([name]) => quote(name)).join(',');
	const lines = rows.map((row) => columns.map(([, pick]) => cell(pick(row))).join(','));

	return `${[header, ...lines].join('\n')}\n`;
}

export function writeOutputs(outDir: string, a: Analysis): void {
	mkdirSync(outDir, { recursive: true });

	writeFileSync(join(outDir, NODES_FILE), toCsv(NODE_COLUMNS, a.nodes));
	writeFileSync(join(outDir, CLUSTERS_FILE), toCsv(CLUSTER_COLUMNS, a.clusters));
	writeFileSync(join(outDir, TOP_FILE), toCsv(TOP_COLUMNS, a.top));
	writeFileSync(join(outDir, ANALYSIS_FILE), JSON.stringify(a));
}

// --- the run summary -----------------------------------------------------------------------------

export const RUN_SUMMARY_FILE = 'run_summary.json';

/**
 * What one run did, beside the CSVs it produced: enough to reproduce it and to tell two runs apart.
 * The input hashes are the reproducibility claim; the warnings are the dataset's declared quirks,
 * recorded so the README's limitations section quotes the run rather than memory.
 */
export interface RunSummary {
	counts: Record<string, number>;
	durationsMs: Record<string, number>;
	finishedAt: string;
	/** SHA-256 of each input file, from `hashInputs`. */
	inputs: Record<string, string>;
	roles: Record<string, number>;
	warnings: string[];
}

export function writeRunSummary(outDir: string, summary: RunSummary): void {
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, RUN_SUMMARY_FILE), `${JSON.stringify(summary, null, '\t')}\n`);
}
