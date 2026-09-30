import { getAnalysis } from '@server/graph/usecase/getAnalysis';
import { type Ctx } from '@server/kernel/ctx';
import { readEnv } from '@server/kernel/env';
import { checkTracing, type TracingStatus } from '@server/kernel/tracing';
import 'server-only';

/**
 * What `/api/health` reports: can this instance answer, and is it being watched?
 *
 * Two different questions, kept apart. The service is **up** only if the analysis loads, because
 * without it every tool refuses and the assistant has nothing to say. The tracker is reported but
 * never takes the service down: an analyst with no traces is worse off than one with them, but
 * much better off than one with no answer.
 */
export interface Health {
	analysis: 'invalid' | 'missing' | 'ok';
	/** 2 248 on the case data; lets a deploy be checked against the dataset it was built from. */
	nodes: number | null;
	provider: string;
	status: 'degraded' | 'down' | 'ok';
	tracing: TracingStatus;
}

export async function checkHealth(ctx: Ctx): Promise<Health> {
	let analysis: Health['analysis'] = 'ok';
	let nodes: number | null = null;

	try {
		const loaded = getAnalysis(ctx);

		if (loaded === null) analysis = 'missing';
		else nodes = loaded.stats.nodes;
	} catch {
		analysis = 'invalid';
	}

	const tracing = await checkTracing();
	const traced = tracing === 'ok' || tracing === 'disabled';

	return {
		analysis,
		nodes,
		provider: readEnv().LLM_PROVIDER,
		status: analysis !== 'ok' ? 'down' : traced ? 'ok' : 'degraded',
		tracing,
	};
}
