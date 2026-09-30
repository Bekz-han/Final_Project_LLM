import { readEnv } from '@server/kernel/env';
import { zodResponseFormat, zodTextFormat } from 'openai/helpers/zod';
import 'server-only';
import { type z } from 'zod';
import { createClient, withRetry } from './client';

/**
 * One model call that comes back as a typed object instead of a string.
 *
 * This is the highest-leverage thing in the starter after the agent loop. Anything of the form
 * "read this and give me structured output" — extract fields from a document, score something
 * against a rubric, generate a list of items, classify, summarise into slots — is one call and a
 * zod schema, with no parsing, no "respond only with JSON" in the prompt, and no repair step when
 * the model wraps its answer in a code fence anyway.
 *
 * The schema is the contract twice over: the provider enforces it during generation, and zod
 * enforces it again on the way back.
 *
 * Two things to know before reaching for it:
 *
 * - Strict structured output requires every property to be required and forbids extra keys. Use
 *   `.nullable()` rather than `.optional()` for a field the model may leave empty, or the
 *   provider rejects the schema outright.
 * - `LLM_PROVIDER=mock` has no model to ask. Pass `fallback` for anything on the demo path, so
 *   the no-key route stays runnable for a reviewer.
 */
export interface CompleteInput<S extends z.ZodType> {
	/** Returned as-is when `LLM_PROVIDER=mock`. Without it, mock mode throws. */
	fallback?: z.output<S>;
	/** System-level guidance. The persistent half of the prompt. */
	instructions?: string;
	/** Identifies the schema to the provider. Letters, digits, underscore and dash only. */
	name?: string;
	/** The request itself. The per-call half of the prompt. */
	prompt: string;
}

export async function complete<S extends z.ZodType>(schema: S, input: CompleteInput<S>): Promise<z.output<S>> {
	const env = readEnv();
	const name = input.name ?? 'result';

	if (env.LLM_PROVIDER === 'mock') {
		if (input.fallback === undefined) {
			throw new Error(
				`complete("${name}") has no fallback and LLM_PROVIDER=mock, so there is no model to ask. ` +
					'Pass a fallback for anything on the demo path.',
			);
		}

		return schema.parse(input.fallback);
	}

	const client = createClient();

	if (env.LLM_PROVIDER === 'chat') {
		const completion = await withRetry(() =>
			client.chat.completions.parse({
				messages: [
					...(input.instructions === undefined ? [] : [{ content: input.instructions, role: 'system' as const }]),
					{ content: input.prompt, role: 'user' as const },
				],
				model: env.LLM_MODEL,
				response_format: zodResponseFormat(schema, name),
			}),
		);

		const parsed = completion.choices[0]?.message.parsed;

		if (parsed === null || parsed === undefined) {
			throw new Error(`complete("${name}") came back without a parsed result.`);
		}

		return schema.parse(parsed);
	}

	const response = await withRetry(() =>
		client.responses.parse({
			input: input.prompt,
			model: env.LLM_MODEL,
			store: false,
			text: { format: zodTextFormat(schema, name) },
			...(input.instructions === undefined ? {} : { instructions: input.instructions }),
		}),
	);

	if (response.output_parsed === null || response.output_parsed === undefined) {
		throw new Error(`complete("${name}") came back without a parsed result.`);
	}

	return schema.parse(response.output_parsed);
}
