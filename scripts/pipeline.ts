/**
 * The pipeline: raw parquet in, the three CSVs, `analysis.json` and `run_summary.json` out. One
 * command, no manual steps — must-have 1 of the ТЗ.
 *
 *   pnpm pipeline
 *   pnpm tsx --conditions=react-server scripts/pipeline.ts --data ./data --out ./output
 *
 * `--conditions=react-server` makes `import 'server-only'` resolve to its empty module outside
 * Next, so the same functions the application uses run here unchanged.
 *
 * It fails loudly — non-zero exit, the reason on stderr — when the input is inconsistent or the
 * result would not pass the jury's mechanical check: a node count other than the dataset's, a top
 * list shorter than 20, an evidence string with no number in it, or a file the application cannot
 * read back. The dataset's declared quirks (truncation, isolated seeds, seeds' under-reported
 * inflow) are printed as warnings and recorded in the run summary, never fatal.
 */
import { readAnalysis } from '@server/graph/repo/analysis';
import { type RunSummary, writeOutputs, writeRunSummary } from '@server/graph/repo/outputs';
import { auditRawGraph, hashInputs, readRawGraph } from '@server/graph/repo/parquet';
import { analyze } from '@server/graph/usecase/analyze';
import { createCtx } from '@server/kernel/ctx';
import { resolve } from 'node:path';

/** The ТЗ dataset. Another dataset is run with `--expect-nodes <n>`. */
const DEFAULT_EXPECTED_NODES = 2248;
const MIN_TOP_ROWS = 20;

function argument(flag: string, fallback: string): string {
	const index = process.argv.indexOf(flag);
	const value = index === -1 ? undefined : process.argv[index + 1];

	return value ?? fallback;
}

function check(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

const fmt = new Intl.NumberFormat('ru-RU');
const n = (value: number): string => fmt.format(value);
const since = (from: number): number => Math.round(performance.now() - from);

function line(text = ''): void {
	process.stdout.write(`${text}\n`);
}

async function main(): Promise<void> {
	const dataDir = resolve(argument('--data', './data'));
	const outDir = resolve(argument('--out', './output'));
	const expectedNodes = Number(argument('--expect-nodes', String(DEFAULT_EXPECTED_NODES)));
	const started = performance.now();
	const durationsMs: Record<string, number> = {};

	line(`Граф денег — пайплайн`);
	line(`  данные:    ${dataDir}`);
	line(`  результат: ${outDir}`);
	line();

	let t = performance.now();
	const inputs = hashInputs(dataDir);
	const raw = await readRawGraph(dataDir);
	const { warnings } = auditRawGraph(raw);

	durationsMs.read = since(t);
	line(`1. Чтение и проверка parquet — ${n(durationsMs.read)} мс`);
	line(`   узлов ${n(raw.nodes.length)}, рёбер ${n(raw.edges.length)}, транзакций ${n(raw.transactions.length)}`);

	for (const [file, hash] of Object.entries(inputs)) line(`   sha256 ${file.padEnd(20)} ${hash}`);

	if (warnings.length > 0) {
		line(`   особенности данных (учтены, не ошибки):`);
		for (const warning of warnings) line(`   ! ${warning}`);
	}

	t = performance.now();
	const analysis = analyze(raw);

	durationsMs.analyze = since(t);
	line(`2. Метрики, роли, кластеры, укладка, приоритеты — ${n(durationsMs.analyze)} мс`);

	const roles: Record<string, number> = {};

	for (const node of analysis.nodes) roles[node.role] = (roles[node.role] ?? 0) + 1;

	for (const [role, count] of Object.entries(roles).sort((a, b) => b[1] - a[1])) {
		line(`   ${role.padEnd(13)} ${String(count).padStart(5)}`);
	}

	line(`   кластеров ${n(analysis.clusters.length)}, топ-лист ${n(analysis.top.length)} строк`);
	line(
		`   период ${analysis.stats.periodFrom} — ${analysis.stats.periodTo}, seed ${n(analysis.stats.seeds)}, ` +
			`оборот ${n(Math.round(analysis.stats.totalKzt))} KZT`,
	);

	t = performance.now();
	writeOutputs(outDir, analysis);
	durationsMs.write = since(t);
	line(`3. Запись nodes_roles.csv, clusters.csv, top_nodes.csv, analysis.json — ${n(durationsMs.write)} мс`);

	// --- what the jury checks mechanically, checked here first ---------------------------------

	check(
		analysis.nodes.length === expectedNodes,
		`nodes_roles.csv has ${n(analysis.nodes.length)} rows, expected ${n(expectedNodes)}. ` +
			`Pass --expect-nodes ${analysis.nodes.length} if this is a different dataset.`,
	);
	check(
		analysis.top.length >= MIN_TOP_ROWS,
		`top_nodes.csv has ${analysis.top.length} rows; the ТЗ requires at least ${MIN_TOP_ROWS}.`,
	);

	const withoutNumbers = analysis.nodes.filter((node) => !/\d/.test(node.evidence));

	check(
		withoutNumbers.length === 0,
		`${n(withoutNumbers.length)} evidence strings carry no number, e.g. gid ${withoutNumbers[0]?.gid ?? '?'}: ` +
			`«${withoutNumbers[0]?.evidence ?? ''}». The ТЗ wants numbers, not adjectives.`,
	);

	const clusterIds = new Set(analysis.clusters.map((cluster) => cluster.clusterId));
	const orphan = analysis.nodes.find((node) => !clusterIds.has(node.clusterId));

	check(
		orphan === undefined,
		`Node ${orphan?.gid ?? '?'} sits in cluster ${orphan?.clusterId ?? '?'}, which clusters.csv does not list.`,
	);

	// The application reads the file through the same function the screen and the tools use, so
	// if this passes, `pnpm dev` will show what was just written.
	const readBack = readAnalysis(outDir);

	check(readBack !== null && readBack.nodes.length === analysis.nodes.length, 'analysis.json could not be read back.');

	durationsMs.total = since(started);

	const summary: RunSummary = {
		counts: {
			clusters: analysis.clusters.length,
			edges: analysis.stats.edges,
			nodes: analysis.stats.nodes,
			seeds: analysis.stats.seeds,
			top: analysis.top.length,
			transactions: analysis.stats.transactions,
		},
		durationsMs,
		finishedAt: createCtx().now.toISOString(),
		inputs,
		roles,
		warnings,
	};

	writeRunSummary(outDir, summary);

	line();
	line(
		`Готово за ${n(durationsMs.total)} мс. Проверки пройдены: ${n(analysis.nodes.length)} узлов, топ ≥ ${MIN_TOP_ROWS}, ` +
			`evidence с числами, analysis.json читается. Сводка запуска: run_summary.json.`,
	);
}

main().catch((error: unknown) => {
	process.stderr.write(`\nПАЙПЛАЙН НЕ ЗАВЕРШЁН\n${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
