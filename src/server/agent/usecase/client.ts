import { readEnv } from '@server/kernel/env';
import OpenAI from 'openai';
import 'server-only';

/**
 * One client, one retry policy, shared by every call that talks to a model.
 *
 * The provider is never named in code. The `openai` SDK speaks to anything that implements the
 * same wire format, so moving between OpenAI, NVIDIA NIM, Groq or a local vLLM is a `.env` edit
 * and nothing else.
 */
/**
 * The SDK's types, re-exported under our own names.
 *
 * Importing `openai` purely for its types elsewhere sets two lint rules fighting over where that
 * import belongs, and the autofix oscillates. One module owns the dependency; everyone else names
 * these.
 */
export type ChatMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ResponseItem = OpenAI.Responses.ResponseInputItem;
export type ResponsesTool = OpenAI.Responses.Tool;

export function createClient(): OpenAI {
	const env = readEnv();

	return new OpenAI({
		apiKey: env.LLM_API_KEY,
		...(env.LLM_BASE_URL === undefined ? {} : { baseURL: env.LLM_BASE_URL }),
	});
}

/**
 * Free and shared tiers answer 429 far more often than anyone expects, and an agentic turn is
 * several calls rather than one — the tool definitions are resent every time and the conversation
 * grows with each result. Two questions in quick succession is enough to trip it.
 *
 * The API usually says how long to wait ("try again in 7.77s"), so we wait exactly that and try
 * again. A slow answer is a demo; an error is not.
 */
export async function withRetry<T>(call: () => Promise<T>): Promise<T> {
	const MAX_ATTEMPTS = 3;

	for (let attempt = 0; ; attempt += 1) {
		try {
			// eslint-disable-next-line no-await-in-loop -- a retry is a sequence by definition
			return await call();
		} catch (cause) {
			const retryable = cause instanceof OpenAI.APIError && (cause.status === 429 || cause.status === 503);

			if (!retryable || attempt >= MAX_ATTEMPTS - 1) throw cause;

			const suggested = /try again in ([\d.]+)s/.exec(cause.message)?.[1];
			const waitMs = Math.min(12_000, Math.ceil(Number(suggested ?? '5') * 1000) + 500);

			// eslint-disable-next-line no-await-in-loop -- see above
			await new Promise((resolve) => {
				setTimeout(resolve, waitMs);
			});
		}
	}
}
