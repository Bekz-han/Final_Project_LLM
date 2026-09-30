import { feedbackSchema, recordFeedback } from '@server/agent/usecase/feedback';

/**
 * 👍 or 👎 on one answer, by its trace id. The interface posts here; so can the notebook.
 *
 * A tracker failure is a 502 with a sentence, never a crash: the analyst's answer is already on
 * their screen, and losing a rating is not worth an error dialog.
 */
const INVALID = 'Не удалось прочитать оценку.';
const NOT_SAVED = 'Оценку не удалось сохранить: трекер недоступен или не настроен.';

export async function POST(request: Request): Promise<Response> {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return Response.json({ message: INVALID }, { status: 400 });
	}

	const parsed = feedbackSchema.safeParse(body);

	if (!parsed.success) return Response.json({ message: INVALID }, { status: 400 });

	const result = await recordFeedback(parsed.data);

	return result.ok ? Response.json({ ok: true }) : Response.json({ message: NOT_SAVED }, { status: 502 });
}
