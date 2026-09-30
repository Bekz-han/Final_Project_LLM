import { type Ctx } from '@server/kernel/ctx';
import 'server-only';
import { type z } from 'zod';

/**
 * The shape of one tool, and the one way to build it.
 *
 * Its own file so that a domain's tools (`graph/usecase/tools.ts`) can build their specs without
 * importing the registry in `./tools.ts`, which imports them back — a cycle.
 */

export interface ToolSpec {
	/** Written for the model: when to reach for this, not what it returns. */
	description: string;
	handler: (ctx: Ctx, args: Record<string, unknown>) => unknown;
	/** Written for a human watching the activity panel. Short. */
	label: string;
	name: string;
	parameters: z.ZodType;
}

/**
 * Validation happens inside the handler, so no caller can forget it.
 *
 * Rule 7 of `AGENTS.md` — validate all external input on the server — applies with force here:
 * tool arguments are a language model's free text, which is about as external as input gets.
 */
export function defineTool<S extends z.ZodType>(spec: {
	description: string;
	handler: (ctx: Ctx, args: z.output<S>) => unknown;
	label: string;
	name: string;
	parameters: S;
}): ToolSpec {
	return {
		description: spec.description,
		handler: (ctx, args) => spec.handler(ctx, spec.parameters.parse(args)),
		label: spec.label,
		name: spec.name,
		parameters: spec.parameters,
	};
}
