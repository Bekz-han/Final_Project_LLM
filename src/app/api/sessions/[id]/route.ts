import { sessionIdSchema } from '@server/agent/model/agent.schema';
import { loadSession } from '@server/agent/usecase/sessions';
import { createCtx } from '@server/kernel/ctx';

/**
 * A stored conversation, for the interface to restore after a reload or a restart.
 *
 * An unknown session is 404 — a fresh browser asks before it has said anything. A malformed id is
 * 400 before it gets near the file system: the id is a file name on the server.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
	const parsed = sessionIdSchema.safeParse((await context.params).id);

	if (!parsed.success) return Response.json({ message: 'Некорректный идентификатор диалога.' }, { status: 400 });

	try {
		const session = loadSession(createCtx(), parsed.data);

		return session === null
			? Response.json({ message: 'Диалог не найден.' }, { status: 404 })
			: Response.json(session);
	} catch (cause) {
		process.stderr.write(
			`Session ${parsed.data} unreadable: ${cause instanceof Error ? cause.message : String(cause)}\n`,
		);

		return Response.json({ message: 'Диалог не удалось прочитать.' }, { status: 500 });
	}
}
