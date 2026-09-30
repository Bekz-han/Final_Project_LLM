import { type ToolCall } from '@server/agent/model/agent.schema';
import { GRAPH_TOOLS } from '@server/graph/usecase/tools';
import { type Ctx } from '@server/kernel/ctx';
import 'server-only';
import { z } from 'zod';
import { defineTool, type ToolSpec } from './defineTool';

/**
 * The tool registry: one place that knows what the agent can do.
 *
 * Adding a tool is one object. Its JSON Schema is derived from the zod schema rather than written
 * twice, so the validation the handler runs and the contract the model is shown can never drift
 * apart — which is the bug that eats an afternoon, because it looks like the model being stupid.
 *
 * The same registry feeds both adapters and the scripted one. A tool is therefore exercised
 * identically however the demo is being driven.
 */

export interface CurrentTime {
	iso: string;
	local: string;
	timeZone: string;
}

/** Reads the clock through `ctx`, so a test pins it. An unknown zone throws a RangeError. */
function currentTime(ctx: Ctx, input: { timeZone?: string | undefined }): CurrentTime {
	const timeZone = input.timeZone ?? 'UTC';
	const local = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(ctx.now);

	return { iso: ctx.now.toISOString(), local, timeZone };
}

/**
 * The clock, plus the graph's tools from `graph/usecase/tools.ts`. Those are all read-only, so none
 * needs a confirmation.
 *
 * A tool that changes stored data also needs a confirmation rule — prompt rule 2 — and a re-check
 * of its own preconditions in the handler. See the agent rules in `AGENTS.md`.
 */
export const TOOLS: readonly ToolSpec[] = [
	...GRAPH_TOOLS,
	defineTool({
		description:
			"Returns the current date and time. Call this whenever an answer depends on today's date or the time of day — never assume it.",
		handler: (ctx, args) => currentTime(ctx, args),
		label: 'Часы сервера',
		name: 'get_current_time',
		parameters: z.object({
			timeZone: z.string().min(1).optional().describe('IANA time zone, for example Asia/Almaty. Defaults to UTC.'),
		}),
	}),
];

/** `$schema` is meaningful to a validator and noise to an inference endpoint. */
function parametersJsonSchema(parameters: z.ZodType): Record<string, unknown> {
	const full = z.toJSONSchema(parameters, { io: 'input' }) as Record<string, unknown>;

	return Object.fromEntries(Object.entries(full).filter(([key]) => key !== '$schema'));
}

/** Chat Completions dialect: NVIDIA NIM, Groq, vLLM, OpenAI. */
export function chatToolDefinitions(): {
	function: { description: string; name: string; parameters: Record<string, unknown> };
	type: 'function';
}[] {
	return TOOLS.map((tool) => ({
		function: {
			description: tool.description,
			name: tool.name,
			parameters: parametersJsonSchema(tool.parameters),
		},
		type: 'function',
	}));
}

/** Responses dialect: the same tools, flattened one level. */
export function responsesToolDefinitions(): {
	description: string;
	name: string;
	parameters: Record<string, unknown>;
	strict: boolean;
	type: 'function';
}[] {
	return TOOLS.map((tool) => ({
		description: tool.description,
		name: tool.name,
		parameters: parametersJsonSchema(tool.parameters),
		// Non-strict on purpose: strict mode requires every property to be required, which forbids
		// the optional arguments that make a tool pleasant to call. Zod validates anyway.
		strict: false,
		type: 'function',
	}));
}

/**
 * Runs one tool and shapes the result for the activity panel.
 *
 * It never throws. A thrown error here would kill the whole turn and the panel would show nothing
 * at all — the one moment somebody is looking straight at it. A tool that fails is a row that says
 * so, which is information; a blank panel is not.
 */
export function executeTool(ctx: Ctx, input: { args: Record<string, unknown>; name: string }): ToolCall {
	// `performance.now` rather than `ctx.now`: this measures elapsed time, it does not ask what
	// time it is. Business rules still read the clock only through `ctx`.
	const started = performance.now();
	const spec = TOOLS.find((candidate) => candidate.name === input.name);
	const elapsed = () => Math.round(performance.now() - started);

	// A model can hallucinate a tool name that was never offered. Saying so beats crashing.
	if (spec === undefined) {
		return {
			arguments: input.args,
			durationMs: elapsed(),
			label: 'Неизвестный инструмент',
			name: input.name,
			result: `Инструмента ${input.name} нет.`,
			status: 'error',
		};
	}

	const base = { arguments: input.args, label: spec.label, name: spec.name };

	try {
		return { ...base, durationMs: elapsed(), result: spec.handler(ctx, input.args), status: 'ok' };
	} catch (cause) {
		return {
			...base,
			durationMs: elapsed(),
			result: cause instanceof Error ? cause.message : 'Инструмент не сработал.',
			status: 'error',
		};
	}
}
