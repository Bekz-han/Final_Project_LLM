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

export const chatRequestSchema = z.object({
	messages: z.array(chatMessageSchema).min(1),
});

export const chatResponseSchema = z.object({
	reply: z.string(),
	toolCalls: z.array(toolCallSchema),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
