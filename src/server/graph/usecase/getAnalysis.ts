import { type Analysis } from '@server/graph/model/graph.schema';
import { OUTPUT_DIR, readAnalysis } from '@server/graph/repo/analysis';
import { type Ctx } from '@server/kernel/ctx';
import { resolve } from 'node:path';
import 'server-only';

/**
 * The page's only entry point to the graph.
 *
 * `src/app/page.tsx` calls this and hands the result down to the graph screen. It is synchronous
 * and cheap after the first call — `readAnalysis` caches by file mtime — so a server component
 * can call it on every render.
 *
 * `null` means the pipeline has not run: render the empty state that says "run `pnpm pipeline`".
 * A thrown error means the file exists and is wrong: render the error state with its message,
 * because re-running the pipeline is the fix only if the pipeline is what is broken.
 *
 * The directory is `output/` under the process's working directory, which for `next dev` and
 * `next start` is the project root — the same place `pnpm pipeline` writes to.
 */
export function getAnalysis(_ctx: Ctx): Analysis | null {
	return readAnalysis(resolve(process.cwd(), OUTPUT_DIR));
}
