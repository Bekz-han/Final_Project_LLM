import {
	type ChatMessage,
	type ChatResponse,
	type ToolCall,
	type TurnResult,
	type Variant,
} from '@server/agent/model/agent.schema';
import { type Analysis } from '@server/graph/model/graph.schema';
import { getAnalysis } from '@server/graph/usecase/getAnalysis';
import { type Ctx } from '@server/kernel/ctx';
import { readEnv } from '@server/kernel/env';
import { randomBytes } from 'node:crypto';
import 'server-only';
import { type ChatMessageParam, createClient, type ResponseItem, type ResponsesTool, withRetry } from './client';
import { runMock } from './mock';
import { chatToolDefinitions, executeTool, responsesToolDefinitions } from './tools';
import { NO_USAGE, UsageMeter } from './usage';
import { type VariantSetup, variantSetup } from './variants';

/**
 * The agent loop, in three dialects that behave identically from the outside.
 *
 * Whichever one runs, the tools are the same objects and `executeTool` is the same function, so a
 * rule enforced in a handler holds on every path — including the scripted one. That is the point
 * of keeping the mock: it is not a stub of the product, it is the product with the model removed.
 *
 * The same loop runs every rung of the course project's ladder (`variants.ts`): a rung only
 * changes what the model is handed — a system prompt or none, few-shot examples, tools or none.
 * With no tools the loop ends after the first call, so the bare model is one request, as it
 * should be, and its cost and latency are measured by the same code as the agent's.
 *
 * `runAgent` is the only thing outside this file that anyone should need.
 */

/**
 * A confused model must not be able to hang the demo — but the cap has to clear the honest path
 * first. A real task legitimately spends several calls on tools and one more on the answer, so a
 * tight cap silently turns a working turn into "I could not finish", which reads as a bug in the
 * product rather than a limit. Ten leaves room for a stray call and still bounds a loop.
 */
const MAX_TURNS = 10;

export interface AgentInput {
	messages: readonly ChatMessage[];
	/** Minted here when the caller has none. */
	traceId?: string | undefined;
	/** Which rung of the ladder to run. The interface always runs the product, `step2`. */
	variant?: Variant | undefined;
}

/** What an adapter needs for one turn. */
interface Run {
	messages: readonly ChatMessage[];
	meter: UsageMeter;
	setup: VariantSetup;
}

/** A model can emit malformed JSON. An empty object gets a validation error from the tool, which
 *  it can read and correct — a thrown parse error ends the turn with nothing to show. */
function parseArgs(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);

		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function contextMessage(ctx: Ctx): string {
	return `Today is ${ctx.now.toISOString().slice(0, 10)}.`;
}

/**
 * The prompt carries the dataset's real size. A broken `analysis.json` must not kill the turn here:
 * the tools will each report it, which is where the panel shows it.
 */
function analysisFor(ctx: Ctx): Analysis | null {
	try {
		return getAnalysis(ctx);
	} catch {
		return null;
	}
}

/** Langfuse and OpenTelemetry both take a 32-hex trace id; minting one here lets the caller log it. */
export function newTraceId(): string {
	return randomBytes(16).toString('hex');
}

interface PreambleMessage {
	content: string;
	role: 'assistant' | 'system' | 'user';
}

/**
 * The system messages and the worked examples, in order, before the analyst's own messages. The
 * bare model gets none of it — not even the date, which would already be a nudge.
 */
function preamble(ctx: Ctx, setup: VariantSetup): PreambleMessage[] {
	if (setup.system === null) return [...setup.fewShot];

	return [
		{ content: setup.system, role: 'system' },
		{ content: contextMessage(ctx), role: 'system' },
		...setup.fewShot,
	];
}

const EXHAUSTED =
	'Не удалось завершить ответ за отведённое число шагов. Переформулируйте вопрос или сузьте его до конкретных gid.';

// --- the Responses adapter ----------------------------------------------------------------------

/**
 * OpenAI's own dialect, and the default.
 *
 * It is the only one that can be handed hosted tools — `web_search` and `file_search` — which is
 * how this product searches the web or a set of uploaded documents without a line of retrieval
 * code, a vector database or an embedding pipeline of ours.
 */
async function runResponses(ctx: Ctx, run: Run): Promise<TurnResult> {
	const env = readEnv();
	const client = createClient();
	const toolCalls: ToolCall[] = [];

	const hosted: Record<string, unknown>[] = [
		...(env.OPENAI_VECTOR_STORE_ID === undefined
			? []
			: [{ type: 'file_search', vector_store_ids: [env.OPENAI_VECTOR_STORE_ID] }]),
		...(env.OPENAI_WEB_SEARCH ? [{ type: 'web_search' }] : []),
	];
	const tools = run.setup.tools ? ([...responsesToolDefinitions(), ...hosted] as ResponsesTool[]) : undefined;

	const conversation: ResponseItem[] = [
		...preamble(ctx, run.setup),
		...run.messages.map((message) => ({ content: message.content, role: message.role })),
	];

	for (let turn = 0; turn < MAX_TURNS; turn += 1) {
		// eslint-disable-next-line no-await-in-loop -- an agent loop is a sequence, not a batch
		const response = await withRetry(() =>
			client.responses.create({
				input: conversation,
				model: env.LLM_MODEL,
				// Nothing is kept on the provider's side: the whole conversation is resent each
				// turn, which is also what makes the transcript ours rather than theirs.
				store: false,
				...(tools === undefined ? {} : { tools }),
			}),
		);

		run.meter.add({ input: response.usage?.input_tokens, output: response.usage?.output_tokens });

		// The model's own items go back in verbatim, reasoning included — dropping them is what
		// makes a reasoning model repeat a tool call it has already made.
		conversation.push(...(response.output as ResponseItem[]));

		const requested = response.output.filter((item) => item.type === 'function_call');

		if (requested.length === 0) {
			return { reply: response.output_text, toolCalls };
		}

		for (const call of requested) {
			const executed = executeTool(ctx, { args: parseArgs(call.arguments), name: call.name });

			toolCalls.push(executed);
			conversation.push({
				call_id: call.call_id,
				output: JSON.stringify(executed.result),
				type: 'function_call_output',
			});
		}
	}

	return { reply: EXHAUSTED, toolCalls };
}

// --- the Chat Completions adapter ---------------------------------------------------------------

/**
 * The portable dialect. NVIDIA NIM, Groq, Together, Fireworks, vLLM and OpenAI all speak it, so
 * this is the path that keeps working when credits run out or one endpoint is saturated.
 *
 * No hosted tools here — that is the trade. Our own tools are identical.
 */
async function runChat(ctx: Ctx, run: Run): Promise<TurnResult> {
	const env = readEnv();
	const client = createClient();
	const toolCalls: ToolCall[] = [];
	const tools = run.setup.tools ? chatToolDefinitions() : undefined;

	const conversation: ChatMessageParam[] = [
		...preamble(ctx, run.setup),
		...run.messages.map((message) => ({ content: message.content, role: message.role })),
	];

	for (let turn = 0; turn < MAX_TURNS; turn += 1) {
		// eslint-disable-next-line no-await-in-loop -- see above
		const completion = await withRetry(() =>
			client.chat.completions.create({
				messages: conversation,
				model: env.LLM_MODEL,
				...(tools === undefined ? {} : { tools }),
			}),
		);

		run.meter.add({ input: completion.usage?.prompt_tokens, output: completion.usage?.completion_tokens });

		const choice = completion.choices[0]?.message;

		if (choice === undefined) break;

		if (choice.tool_calls === undefined || choice.tool_calls.length === 0) {
			return { reply: choice.content ?? '', toolCalls };
		}

		conversation.push(choice);

		for (const requested of choice.tool_calls.filter((candidate) => candidate.type === 'function')) {
			const executed = executeTool(ctx, {
				args: parseArgs(requested.function.arguments),
				name: requested.function.name,
			});

			toolCalls.push(executed);
			conversation.push({
				content: JSON.stringify(executed.result),
				role: 'tool',
				tool_call_id: requested.id,
			});
		}
	}

	return { reply: EXHAUSTED, toolCalls };
}

// The scripted adapter lives in `./mock.ts`: it is the demo's script, not a dialect.

// --- the entry point ----------------------------------------------------------------------------

function dispatch(ctx: Ctx, input: { agent: AgentInput; run: Run }): Promise<TurnResult> {
	switch (readEnv().LLM_PROVIDER) {
		case 'chat':
			return runChat(ctx, input.run);

		case 'mock':
			// The script is the product with the model removed: it has no lower rungs to run.
			return Promise.resolve(runMock(ctx, input.agent));

		case 'responses':
		default:
			return runResponses(ctx, input.run);
	}
}

export async function runAgent(ctx: Ctx, input: AgentInput): Promise<ChatResponse> {
	// `performance.now` rather than `ctx.now`: this measures elapsed time, it does not ask what
	// time it is. Business rules still read the clock only through `ctx`.
	const started = performance.now();
	const variant = input.variant ?? 'step2';
	const meter = new UsageMeter();
	const run: Run = { messages: input.messages, meter, setup: variantSetup(variant, analysisFor(ctx)) };
	const result = await dispatch(ctx, { agent: input, run });

	return {
		...result,
		latencyMs: Math.round(performance.now() - started),
		traceId: input.traceId ?? newTraceId(),
		usage: readEnv().LLM_PROVIDER === 'mock' ? NO_USAGE : meter.total(),
		variant,
	};
}
