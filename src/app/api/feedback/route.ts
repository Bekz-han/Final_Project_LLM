import { feedbackSchema, recordFeedback } from '@server/agent/usecase/feedback';
import { createCtx } from '@server/kernel/ctx';

/**
 * 👍 or 👎 on one answer, by its trace id. The interface posts here; so can the notebook.
 *
 * Kept if either copy is kept — the stored conversation or the Langfuse score — and the response
 * says which. Neither is a crash: the analyst's answer is already on their screen, and losing a
 * rating is not worth an error dialog, so the interface shows the 502's sentence quietly.
 */
const INVALID = 'Не удалось прочитать оценку.';
const NOT_SAVED = 'Оценку не удалось сохранить: нет такого ответа в диалоге, и трекер недоступен или не настроен.';

export async function POST(request: Request): Promise<Response> {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return Response.json({ message: INVALID }, { status: 400 });
	}

	const parsed = feedbackSchema.safeParse(body);

	if (!parsed.success) return Response.json({ message: INVALID }, { status: 400 });

	const result = await recordFeedback(createCtx(), parsed.data);

	return result.stored || result.tracked
		? Response.json({ ok: true, ...result })
		: Response.json({ message: NOT_SAVED, ...result }, { status: 502 });
}
