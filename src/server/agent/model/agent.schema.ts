import { z } from 'zod';

/**
 * The contract between the server and the interface.
 *
 * ESLint classifies a `*.schema.ts` under a domain's `model` directory as `shared-schema` — the
 * one thing inside `src/server` a view is allowed to import. That is why there is no
 * `import 'server-only'` here and nothing but zod: everything in this file may end up in a
 * browser bundle, so nothing in it may reach a key, a connection string or the file system.
 *
 * Put the shapes the UI renders here. Keep the rest in `model/` next door.
 */

/** One executed tool, already shaped for the activity panel. */
export const toolCallSchema = z.object({
	arguments: z.record(z.string(), z.unknown()),
	/** Wall-clock cost of the handler. Shown in the panel: it makes the work look real. */
	durationMs: z.number(),
	/** Human phrase for the panel, carried from the registry so the UI needs no lookup table. */
	label: z.string(),
	name: z.string(),
	result: z.unknown(),
	status: z.enum(['ok', 'error']),
});

export const chatMessageSchema = z.object({
	content: z.string(),
	role: z.enum(['assistant', 'user']),
});

/**
 * The rungs of the intervention ladder the course project measures, one change between each:
 *
 * - `step0`  — the bare model: the analyst's messages and nothing else.
 * - `step1`  — a worked prompt and few-shot examples: the task contract and the refusal rules, but
 *              no access to the graph.
 * - `step1b` — the same prompt plus the analysis summary pasted into it: the top list, role counts,
 *              clusters. The honest alternative to tools.
 * - `step2`  — the product: the prompt, the few-shot examples and the seven graph tools.
 * - `step2plus` — the product with one change: a role is explained money first (see `prompt.ts`).
 *
 * The interface always asks for `step2`; the others exist for the notebook's measurements.
 */
export const VARIANTS = ['step0', 'step1', 'step1b', 'step2', 'step2plus'] as const;
export const variantSchema = z.enum(VARIANTS);

/** Opaque ids from the caller, carried into the trace. Bounded so a trace cannot be flooded. */
const traceLabelSchema = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.regex(/^[\w.:@-]+$/u, 'Letters, digits and . _ : @ - only.');

/**
 * A session id doubles as a file name on the server, so its alphabet is the trace label's: no
 * dots-only names, no slashes, nothing a path can be built from.
 */
export const sessionIdSchema = traceLabelSchema.refine((value) => !/^\.+$/u.test(value), 'Not a session id.');

export const chatRequestSchema = z.object({
	messages: z.array(chatMessageSchema).min(1),
	sessionId: sessionIdSchema.optional(),
	userId: traceLabelSchema.optional(),
	variant: variantSchema.default('step2'),
});

/** What one answer cost, summed over every model call in the turn. */
export const usageSchema = z.object({
	/** At the configured prices, `LLM_PRICE_INPUT_PER_MTOK` and `LLM_PRICE_OUTPUT_PER_MTOK`. */
	costUsd: z.number().nonnegative(),
	inputTokens: z.number().int().nonnegative(),
	modelCalls: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
});

export const chatResponseSchema = z.object({
	/** Wall-clock time of the whole turn on the server, model calls and tools included. */
	latencyMs: z.number().nonnegative(),
	reply: z.string(),
	toolCalls: z.array(toolCallSchema),
	/** The id this turn is traced under, so a score or a complaint can be attached to it later. */
	traceId: z.string(),
	usage: usageSchema,
	variant: variantSchema,
});

/** One message of a stored conversation, with what the interface needs to rate it. */
export const storedTurnSchema = z.object({
	at: z.string(),
	content: z.string(),
	/** The analyst's rating of an assistant message: 1 useful, 0 not. */
	feedback: z.union([z.literal(0), z.literal(1)]).optional(),
	role: z.enum(['assistant', 'user']),
	/** On assistant messages: the trace the answer was produced under. */
	traceId: z.string().optional(),
});

export const sessionSchema = z.object({
	id: sessionIdSchema,
	turns: z.array(storedTurnSchema),
	updatedAt: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type StoredTurn = z.infer<typeof storedTurnSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
/** What one adapter produces; `runAgent` adds the measurements around it. */
export type TurnResult = Pick<ChatResponse, 'reply' | 'toolCalls'>;
export type Usage = z.infer<typeof usageSchema>;
export type Variant = z.infer<typeof variantSchema>;
