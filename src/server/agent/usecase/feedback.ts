import { sendScore } from '@server/kernel/tracing';
import 'server-only';
import { z } from 'zod';

/**
 * The analyst's verdict on one answer, attached to that answer's trace as the score
 * `user_feedback` — 1 useful, 0 not. In Langfuse it sits next to the rule's and the judge's scores
 * on the same trace, which is how a thumbs-down is traced back to the tool call that caused it.
 */
export const feedbackSchema = z.object({
	comment: z.string().trim().max(500).optional(),
	traceId: z.string().regex(/^[0-9a-f]{32}$/u, 'A trace id is 32 hex characters.'),
	value: z.union([z.literal(0), z.literal(1)]),
});

export type Feedback = z.infer<typeof feedbackSchema>;

export async function recordFeedback(feedback: Feedback): Promise<{ ok: boolean; reason?: string }> {
	const result = await sendScore({
		comment: feedback.comment,
		name: 'user_feedback',
		traceId: feedback.traceId,
		value: feedback.value,
	});

	return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
