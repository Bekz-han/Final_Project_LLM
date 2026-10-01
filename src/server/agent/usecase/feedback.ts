import { sessionIdSchema } from '@server/agent/model/agent.schema';
import { type Ctx } from '@server/kernel/ctx';
import { sendScore } from '@server/kernel/tracing';
import 'server-only';
import { z } from 'zod';
import { maskPii } from './pii';
import { saveFeedback } from './sessions';

/**
 * The analyst's verdict on one answer — 1 useful, 0 not — kept in two places for two reasons.
 *
 * - On the trace in Langfuse, as the score `user_feedback`, next to the rule's and the judge's
 *   scores. That is how a thumbs-down is traced back to the tool call that caused it.
 * - In the stored conversation, so the button still shows what was pressed after a reload or a
 *   restart. That copy does not depend on the tracker being configured or reachable.
 */
export const feedbackSchema = z.object({
	comment: z.string().trim().max(500).optional(),
	sessionId: sessionIdSchema.optional(),
	traceId: z.string().regex(/^[0-9a-f]{32}$/u, 'A trace id is 32 hex characters.'),
	value: z.union([z.literal(0), z.literal(1)]),
});

export type Feedback = z.infer<typeof feedbackSchema>;

export interface FeedbackResult {
	/** Written into the stored conversation. */
	stored: boolean;
	/** Accepted by Langfuse as a score on the trace. */
	tracked: boolean;
}

export async function recordFeedback(ctx: Ctx, feedback: Feedback): Promise<FeedbackResult> {
	let stored = false;

	if (feedback.sessionId !== undefined) {
		try {
			stored = saveFeedback(ctx, { id: feedback.sessionId, traceId: feedback.traceId, value: feedback.value });
		} catch (cause) {
			process.stderr.write(
				`Feedback not stored for ${feedback.traceId}: ${cause instanceof Error ? cause.message : String(cause)}\n`,
			);
		}
	}

	const sent = await sendScore({
		// A complaint is free text too, and it goes to the same tracker.
		comment: feedback.comment === undefined ? undefined : maskPii(feedback.comment).text,
		name: 'user_feedback',
		traceId: feedback.traceId,
		value: feedback.value,
	});

	return { stored, tracked: sent.ok };
}
