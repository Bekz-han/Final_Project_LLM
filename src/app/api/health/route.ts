import { checkHealth } from '@server/agent/usecase/health';
import { createCtx } from '@server/kernel/ctx';

/**
 * Liveness for Docker, a load balancer or a person with curl.
 *
 * 200 while the service can answer; 503 when it cannot (the analysis is missing or broken), so an
 * orchestrator restarts or stops routing to it. A tracker problem is `degraded`, still 200: it is
 * reported, not fatal.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
	const health = await checkHealth(createCtx());

	return Response.json(health, { status: health.status === 'down' ? 503 : 200 });
}
