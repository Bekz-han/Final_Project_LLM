/**
 * The whole gate, in parallel.
 *
 *   pnpm check
 *
 * `pnpm verify && pnpm test` runs typecheck, then lint, then the suite, one after another, and
 * each waits for the last to finish even though none of them needs anything the others produce.
 * Lint dominates — it is roughly three quarters of the wall clock — so the sequential run is
 * mostly the other two waiting for it.
 *
 * Output is buffered per task and printed in a fixed order once everything has finished. Three
 * processes writing to one terminal at once interleave into something nobody can read, and a
 * failure you cannot read is a failure you will misdiagnose.
 *
 * Exit code is non-zero if any task failed, so this is usable as the one command before a commit.
 */
import { spawn } from 'node:child_process';

/**
 * @typedef {{ code: number, ms: number, name: string, output: string }} Result
 */

/** @type {readonly string[]} */
const TASKS = ['typecheck', 'lint', 'test'];

/**
 * @param {string} name
 * @returns {Promise<Result>}
 */
function run(name) {
	return new Promise((resolve) => {
		const started = Date.now();
		// `shell: true` because on Windows pnpm is a .cmd shim and spawn cannot exec it directly.
		const child = spawn('pnpm', [name], { shell: true });
		/** @type {string[]} */
		const chunks = [];

		child.stdout.on('data', (chunk) => chunks.push(String(chunk)));
		child.stderr.on('data', (chunk) => chunks.push(String(chunk)));

		child.on('close', (code) => {
			resolve({ code: code ?? 1, ms: Date.now() - started, name, output: chunks.join('') });
		});
	});
}

const started = Date.now();
/** @type {Result[]} */
const results = await Promise.all(TASKS.map(run));
const failed = results.filter((result) => result.code !== 0);

for (const result of results) {
	if (result.code !== 0) {
		process.stdout.write(`\n${'='.repeat(70)}\n${result.name} FAILED\n${'='.repeat(70)}\n`);
		process.stdout.write(result.output.trimEnd() + '\n');
	}
}

process.stdout.write('\n');
for (const result of results) {
	process.stdout.write(`  ${result.code === 0 ? 'pass' : 'FAIL'}  ${result.name.padEnd(10)} ${result.ms}ms\n`);
}
process.stdout.write(`\n  ${failed.length === 0 ? 'GATE GREEN' : 'GATE RED'} in ${Date.now() - started}ms\n\n`);

process.exitCode = failed.length === 0 ? 0 : 1;
