import { type Session } from '@server/agent/model/agent.schema';
import { readSession, writeSession } from '@server/agent/repo/sessions';
import { type Ctx } from '@server/kernel/ctx';
import { readEnv } from '@server/kernel/env';
import 'server-only';

/**
 * The conversation's memory, so it survives a reload of the page and a restart of the service.
 *
 * The client still sends the whole history with each question — the agent is stateless, and the
 * notebook calls it with no session at all. What is stored is the record: each exchange appended
 * after it is answered, with the trace id of the answer, and the analyst's rating once given. The
 * interface reads it back on load.
 */

function stateDir(): string {
	return readEnv().STATE_DIR;
}

export function loadSession(_ctx: Ctx, id: string): Session | null {
	return readSession(stateDir(), id);
}

export function saveExchange(
	ctx: Ctx,
	exchange: { answer: string; id: string; question: string; traceId: string },
): Session {
	const at = ctx.now.toISOString();
	const current = readSession(stateDir(), exchange.id) ?? { id: exchange.id, turns: [], updatedAt: at };
	const next: Session = {
		...current,
		turns: [
			...current.turns,
			{ at, content: exchange.question, role: 'user' },
			{ at, content: exchange.answer, role: 'assistant', traceId: exchange.traceId },
		],
		updatedAt: at,
	};

	writeSession(stateDir(), next);

	return next;
}

/** Marks the answer with this trace id. `false` when the session or the answer is not found. */
export function saveFeedback(ctx: Ctx, input: { id: string; traceId: string; value: 0 | 1 }): boolean {
	const current = readSession(stateDir(), input.id);

	if (!current?.turns.some((turn) => turn.traceId === input.traceId)) return false;

	writeSession(stateDir(), {
		...current,
		turns: current.turns.map((turn) => (turn.traceId === input.traceId ? { ...turn, feedback: input.value } : turn)),
		updatedAt: ctx.now.toISOString(),
	});

	return true;
}
