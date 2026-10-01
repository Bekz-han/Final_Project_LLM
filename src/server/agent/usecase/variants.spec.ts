import { runAgent } from '@server/agent/usecase/agent';
import { FEW_SHOT, variantSetup } from '@server/agent/usecase/variants';
import { type Analysis, type RawGraph } from '@server/graph/model/graph.schema';
import { analyze } from '@server/graph/usecase/analyze';
import { type Ctx } from '@server/kernel/ctx';
import { resetEnvCache } from '@server/kernel/env';
import { type OtlpSpan } from '@server/kernel/tracing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ladder is only a measurement if each rung changes one thing. These pin what each rung hands
 * the model — by recording the requests a fake client receives — and that the turn's tokens and
 * cost are summed over every call, not taken from the last one.
 */

const fake = vi.hoisted(() => ({
	/** Scripted replies, consumed in order. */
	replies: [] as Record<string, unknown>[],
	/** Each request the loop sent, in order. */
	requests: [] as Record<string, unknown>[],
}));

vi.mock('@server/agent/usecase/client', async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();

	return {
		...original,
		createClient: () => ({
			responses: {
				create: (request: Record<string, unknown>) => {
					fake.requests.push(structuredClone(request));

					return Promise.resolve(fake.replies.shift());
				},
			},
		}),
	};
});

const source = vi.hoisted(() => ({ analysis: null as Analysis | null }));

vi.mock('@server/graph/usecase/getAnalysis', () => ({ getAnalysis: () => source.analysis }));

const SEED = '100000000000000001';
const PAYEE = '100000000000000002';

const RAW: RawGraph = {
	edges: [{ depth: 1, dst: PAYEE, nTx: 1, src: SEED, sumKzt: 50_000 }],
	nodes: [
		{ depth: 0, gid: SEED, isSeed: true },
		{ depth: 1, gid: PAYEE, isSeed: false },
	],
	transactions: [{ date: '2026-07-01', dst: PAYEE, src: SEED, sumKzt: 50_000 }],
};

const ANALYSIS = analyze(RAW);
const ctx: Ctx = { now: new Date('2026-09-30T10:00:00.000Z') };
const QUESTION = { content: 'Кого проверять первым?', role: 'user' as const };

function answer(text: string, usage = { input_tokens: 100, output_tokens: 20 }) {
	return { output: [{ content: [], role: 'assistant', type: 'message' }], output_text: text, usage };
}

function toolCall(name: string, args: Record<string, unknown>) {
	return {
		output: [{ arguments: JSON.stringify(args), call_id: 'call_1', name, type: 'function_call' }],
		output_text: '',
		usage: { input_tokens: 300, output_tokens: 10 },
	};
}

beforeEach(() => {
	process.env.LLM_PROVIDER = 'responses';
	process.env.LLM_API_KEY = 'test-key-not-real';
	process.env.LLM_PRICE_INPUT_PER_MTOK = '0.1';
	process.env.LLM_PRICE_OUTPUT_PER_MTOK = '0.5';
	resetEnvCache();
	fake.requests.length = 0;
	fake.replies.length = 0;
	source.analysis = ANALYSIS;
});

describe('what each rung hands the model', () => {
	it('step 0 is the bare model: the question alone, no system message, no tools', async () => {
		fake.replies.push(answer('не знаю'));

		const result = await runAgent(ctx, { messages: [QUESTION], variant: 'step0' });
		const [request] = fake.requests;

		expect(request?.input).toEqual([QUESTION]);
		expect(request).not.toHaveProperty('tools');
		expect(result.variant).toBe('step0');
		expect(result.toolCalls).toEqual([]);
	});

	it('step 1 adds the contract and the few-shot examples, still without tools or data', async () => {
		fake.replies.push(answer('нет данных'));

		await runAgent(ctx, { messages: [QUESTION], variant: 'step1' });
		const input = fake.requests[0]?.input as { content: string; role: string }[];

		expect(input[0]?.role).toBe('system');
		expect(input[0]?.content).toContain('NO access to the graph data');
		expect(input[0]?.content).not.toContain('TOOLS');
		for (const example of FEW_SHOT) expect(input).toContainEqual(example);
		expect(fake.requests[0]).not.toHaveProperty('tools');
	});

	it('step 1b is step 1 with the analysis summary pasted in — the top list included', () => {
		const setup = variantSetup('step1b', ANALYSIS);

		expect(setup.tools).toBe(false);
		expect(setup.system).toContain('DATA (a summary');
		expect(setup.system).toContain(ANALYSIS.top[0]?.gid);
		expect(setup.fewShot).toBe(FEW_SHOT);
	});

	it('step 2, the product, gets the same examples and the tools', async () => {
		fake.replies.push(toolCall('get_top_nodes', { limit: 5 }), answer('Первым — …'));

		const result = await runAgent(ctx, { messages: [QUESTION], variant: 'step2' });

		expect(fake.requests[0]).toHaveProperty('tools');
		expect(result.toolCalls.map((call) => call.name)).toEqual(['get_top_nodes']);
	});

	it('runs the product when no rung is named', async () => {
		fake.replies.push(answer('ok'));

		expect((await runAgent(ctx, { messages: [QUESTION] })).variant).toBe('step2');
	});

	it('changes exactly one thing between steps 1 and 1b: the DATA section', () => {
		const one = variantSetup('step1', ANALYSIS).system ?? '';
		const oneB = variantSetup('step1b', ANALYSIS).system ?? '';

		expect(oneB.startsWith(one.slice(0, one.indexOf('HARD RULES')))).toBe(true);
		expect(oneB).toContain(one.slice(one.indexOf('WORDS TO USE')));
	});
});

describe('the measurements on every answer', () => {
	it('sums tokens and cost over every model call of the turn', async () => {
		fake.replies.push(
			toolCall('get_top_nodes', { limit: 5 }),
			answer('готово', { input_tokens: 700, output_tokens: 90 }),
		);

		const { usage } = await runAgent(ctx, { messages: [QUESTION], variant: 'step2' });

		expect(usage).toMatchObject({ inputTokens: 1000, modelCalls: 2, outputTokens: 100 });
		// 1 000 tokens in at $0.10/M and 100 out at $0.50/M: $0.00015.
		expect(usage.costUsd).toBeCloseTo(0.00015, 10);
	});

	it('uses the prices from the environment, not a constant', async () => {
		process.env.LLM_PRICE_INPUT_PER_MTOK = '2';
		process.env.LLM_PRICE_OUTPUT_PER_MTOK = '8';
		resetEnvCache();
		fake.replies.push(answer('ok', { input_tokens: 1_000_000, output_tokens: 1_000_000 }));

		expect((await runAgent(ctx, { messages: [QUESTION], variant: 'step0' })).usage.costUsd).toBe(10);
	});

	it('keeps the trace id it was given, and mints a 32-hex one otherwise', async () => {
		fake.replies.push(answer('a'), answer('b'));

		expect((await runAgent(ctx, { messages: [QUESTION], traceId: 'abc' })).traceId).toBe('abc');
		expect((await runAgent(ctx, { messages: [QUESTION] })).traceId).toMatch(/^[0-9a-f]{32}$/u);
	});
});

/** The spans of an OTLP request body, with attributes flattened to plain values. */
function spansOf(body: string): {
	attrs: Record<string, unknown>;
	name: string;
	status: { code: number };
	traceId: string;
}[] {
	const parsed = JSON.parse(body) as {
		resourceSpans?: { scopeSpans: { spans: OtlpSpan[] }[] }[];
	};
	const spans = parsed.resourceSpans?.[0]?.scopeSpans[0]?.spans ?? [];

	return spans.map((span) => ({
		attrs: Object.fromEntries(
			span.attributes.map(({ key, value }) => [
				key,
				'arrayValue' in value ? value.arrayValue.values.map((item) => item.stringValue) : Object.values(value)[0],
			]),
		),
		name: span.name,
		status: span.status,
		traceId: span.traceId,
	}));
}

describe('the few-shot examples', () => {
	/** An example that is also an evaluation question is a leak: the rung would be graded on its own answer key. */
	it('share no question with the frozen evaluation set', () => {
		const questions = readFileSync(resolve('eval/eval_set.jsonl'), 'utf8')
			.trim()
			.split('\n')
			.map((line) => (JSON.parse(line) as { input: string }).input.toLowerCase());

		for (const example of FEW_SHOT.filter((message) => message.role === 'user')) {
			expect(questions).not.toContain(example.content.toLowerCase());
		}
	});

	/** A gid from the analysis would teach a fact; one from the evaluation set would leak an answer. */
	it('name only gids that exist in neither the analysis nor the evaluation set', () => {
		const analysis = readFileSync(resolve('output/analysis.json'), 'utf8');
		const evalSet = readFileSync(resolve('eval/eval_set.jsonl'), 'utf8');
		const gids = FEW_SHOT.flatMap((example) => example.content.match(/\d{15,}/gu) ?? []);

		expect(gids.length).toBeGreaterThan(0);

		for (const gid of gids) {
			expect(analysis).not.toContain(`"${gid}"`);
			expect(evalSet).not.toContain(gid);
		}
	});
});

describe('the trace of a turn', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.LANGFUSE_PUBLIC_KEY;
		delete process.env.LANGFUSE_SECRET_KEY;
	});

	/** What the course grades: every step visible, with its tokens and cost, under a session and a user. */
	it('has one generation per model call, one span per tool, and the session, user and rung', async () => {
		process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
		process.env.LANGFUSE_SECRET_KEY = 'sk-test';

		const bodies: string[] = [];

		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init: RequestInit) => {
				bodies.push(typeof init.body === 'string' ? init.body : '');

				return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
			}),
		);
		fake.replies.push(toolCall('get_top_nodes', { limit: 5 }), answer('Первым — …'));

		const result = await runAgent(ctx, {
			messages: [QUESTION],
			sessionId: 'session-7',
			traceId: 'c'.repeat(32),
			userId: 'eval',
			variant: 'step2',
		});
		const spans = spansOf(bodies[0] ?? '{}');

		expect(spans.map((span) => [span.name, span.attrs['langfuse.observation.type']])).toEqual([
			['agent turn', 'agent'],
			['model call 1', 'generation'],
			['tool get_top_nodes', 'tool'],
			['model call 2', 'generation'],
		]);
		expect(spans.every((span) => span.traceId === 'c'.repeat(32))).toBe(true);
		expect(spans[0]?.attrs).toMatchObject({
			'langfuse.session.id': 'session-7',
			'langfuse.trace.output': result.reply,
			'langfuse.trace.tags': ['step2', 'responses'],
			'langfuse.user.id': 'eval',
		});
		expect(JSON.parse(String(spans[1]?.attrs['langfuse.observation.usage_details']))).toEqual({
			input: 300,
			output: 10,
			total: 310,
		});
		expect(JSON.parse(String(spans[2]?.attrs['langfuse.observation.input']))).toEqual({ limit: 5 });
	});

	it('is still sent, marked ERROR, when the model call fails — and the failure reaches the caller', async () => {
		process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
		process.env.LANGFUSE_SECRET_KEY = 'sk-test';

		const bodies: string[] = [];

		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init: RequestInit) => {
				bodies.push(typeof init.body === 'string' ? init.body : '');

				return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
			}),
		);
		// No scripted reply: the fake client resolves to undefined and the loop fails reading it.

		await expect(runAgent(ctx, { messages: [QUESTION], variant: 'step0' })).rejects.toThrow();

		const [root] = spansOf(bodies[0] ?? '{}');

		expect(root?.attrs).toMatchObject({
			'langfuse.observation.level': 'ERROR',
			'langfuse.trace.metadata.error': 'TypeError',
		});
		expect(root?.status.code).toBe(2);
	});
});

describe('step 2+, the one change on top of the product', () => {
	it('differs from step 2 only in how a role is explained, and keeps the tools and examples', () => {
		const two = variantSetup('step2', ANALYSIS);
		const plus = variantSetup('step2plus', ANALYSIS);
		const before = (two.system ?? '').split('\n\n');
		const after = (plus.system ?? '').split('\n\n');
		const changed = after.filter((paragraph) => !before.includes(paragraph));

		expect(plus.tools).toBe(true);
		expect(plus.fewShot).toBe(two.fewShot);
		expect(after).toHaveLength(before.length);
		expect(changed).toHaveLength(1);
		expect(changed[0]).toMatch(/^EXPLAINING A ROLE: .*money first/su);
	});
});
