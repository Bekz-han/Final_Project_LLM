import { checkTracing, type OtlpSpan, sendScore, sendTrace, Trace, tracingConfig } from '@server/kernel/tracing';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The tracker is an HTTP API, so these stub `fetch` and read back exactly what would be sent. The
 * point of each: a payload Langfuse's OpenTelemetry endpoint maps onto a trace, a failure that is
 * reported instead of swallowed, and a turn that never breaks because the tracker did.
 */

const CONFIG = { auth: 'Basic dGVzdDp0ZXN0', baseUrl: 'https://tracker.test', environment: 'test' };
const TRACE_ID = 'a'.repeat(32);

interface Sent {
	body: string;
	headers: Record<string, string>;
	url: string;
}

function stubFetch(response: { body?: unknown; status: number }): Sent[] {
	const calls: Sent[] = [];

	vi.stubGlobal(
		'fetch',
		vi.fn((url: string, init: RequestInit) => {
			calls.push({
				body: typeof init.body === 'string' ? init.body : '',
				headers: (init.headers ?? {}) as Record<string, string>,
				url,
			});

			return Promise.resolve(new Response(JSON.stringify(response.body ?? {}), { status: response.status }));
		}),
	);

	return calls;
}

function plain(value: OtlpSpan['attributes'][number]['value']): unknown {
	if ('stringValue' in value) return value.stringValue;
	if ('doubleValue' in value) return value.doubleValue;
	if ('boolValue' in value) return value.boolValue;

	return value.arrayValue.values.map((item) => item.stringValue);
}

/** The spans of an OTLP request body, with attributes flattened to plain values. */
function spansOf(body: string): (Omit<OtlpSpan, 'attributes'> & { attrs: Record<string, unknown> })[] {
	const parsed = JSON.parse(body) as { resourceSpans: { scopeSpans: { spans: OtlpSpan[] }[] }[] };
	const spans = parsed.resourceSpans[0]?.scopeSpans[0]?.spans ?? [];

	return spans.map(({ attributes, ...span }) => ({
		...span,
		attrs: Object.fromEntries(attributes.map(({ key, value }) => [key, plain(value)])),
	}));
}

function sampleTrace(): Trace {
	const trace = new Trace({
		input: 'Кого проверять первым?',
		metadata: { variant: 'step2' },
		name: 'agent turn',
		sessionId: 'session-1',
		tags: ['step2', 'responses'],
		traceId: TRACE_ID,
		userId: 'analyst',
	});

	trace.generation({
		costUsd: { input: 0.0001, output: 0.00005 },
		endTime: '2026-09-30T10:00:01.000Z',
		input: [{ content: 'q', role: 'user' }],
		model: 'gpt-6-luna',
		name: 'model call 1',
		output: [],
		startTime: '2026-09-30T10:00:00.000Z',
		usage: { input: 1000, output: 100 },
	});
	trace.span({
		endTime: '2026-09-30T10:00:01.100Z',
		input: { limit: 5 },
		level: 'ERROR',
		name: 'tool get_top_nodes',
		output: 'failed',
		startTime: '2026-09-30T10:00:01.050Z',
	});

	return trace;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('tracingConfig', () => {
	it('is off without both keys, so the reviewer path needs no account', () => {
		expect(tracingConfig({})).toBeNull();
		expect(tracingConfig({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: '' })).toBeNull();
	});

	it('reads LANGFUSE_BASE_URL first, then the notebook’s LANGFUSE_HOST, and trims a trailing slash', () => {
		const keys = { LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' };

		expect(tracingConfig({ ...keys, LANGFUSE_BASE_URL: 'https://eu.test/' })?.baseUrl).toBe('https://eu.test');
		expect(tracingConfig({ ...keys, LANGFUSE_HOST: 'https://us.test' })?.baseUrl).toBe('https://us.test');
		expect(tracingConfig(keys)?.baseUrl).toBe('https://cloud.langfuse.com');
		expect(tracingConfig(keys)?.auth).toBe(`Basic ${Buffer.from('pk:sk').toString('base64')}`);
	});
});

describe('a trace', () => {
	/** The deprecated ingestion endpoint answers 207 and drops the events for new organisations. */
	it('goes to the OpenTelemetry endpoint with the current ingestion version', async () => {
		const calls = stubFetch({ body: {}, status: 200 });

		const result = await sendTrace(sampleTrace().finish({ metadata: {}, output: 'ответ' }), CONFIG);

		expect(result).toEqual({ accepted: 3, ok: true });
		expect(calls[0]?.url).toBe('https://tracker.test/api/public/otel/v1/traces');
		expect(calls[0]?.headers).toMatchObject({ authorization: CONFIG.auth, 'x-langfuse-ingestion-version': '4' });
	});

	it('is one root span with the trace attributes, and its steps as children under the same trace id', async () => {
		const calls = stubFetch({ status: 200 });

		await sendTrace(sampleTrace().finish({ metadata: { latencyMs: 1234 }, output: 'ответ' }), CONFIG);
		const [root, generation, tool] = spansOf(calls[0]?.body ?? '{}');

		expect(root?.attrs).toMatchObject({
			'langfuse.environment': 'test',
			'langfuse.session.id': 'session-1',
			'langfuse.trace.metadata.latencyMs': 1234,
			'langfuse.trace.metadata.variant': 'step2',
			'langfuse.trace.name': 'agent turn',
			'langfuse.trace.output': 'ответ',
			'langfuse.trace.tags': ['step2', 'responses'],
			'langfuse.user.id': 'analyst',
		});
		expect(root?.parentSpanId).toBeUndefined();
		expect([generation?.parentSpanId, tool?.parentSpanId]).toEqual([root?.spanId, root?.spanId]);
		expect(new Set([root, generation, tool].map((span) => span?.traceId))).toEqual(new Set([TRACE_ID]));
	});

	it('carries the model, tokens and cost on the generation, as JSON Langfuse reads', async () => {
		const calls = stubFetch({ status: 200 });

		await sendTrace(sampleTrace().finish({ metadata: {}, output: '' }), CONFIG);
		const generation = spansOf(calls[0]?.body ?? '{}')[1];

		expect(generation?.attrs['langfuse.observation.type']).toBe('generation');
		expect(generation?.attrs['gen_ai.request.model']).toBe('gpt-6-luna');
		expect(JSON.parse(String(generation?.attrs['langfuse.observation.usage_details']))).toEqual({
			input: 1000,
			output: 100,
			total: 1100,
		});
		expect(JSON.parse(String(generation?.attrs['langfuse.observation.cost_details']))).toMatchObject({
			input: 0.0001,
			output: 0.00005,
		});
		// Nanosecond timestamps as strings: a double would round 1.79e18.
		expect(generation?.startTimeUnixNano).toBe('1790762400000000000');
	});

	it('marks a failed tool as a tool span at level ERROR', async () => {
		const calls = stubFetch({ status: 200 });

		await sendTrace(sampleTrace().finish({ metadata: {}, output: '' }), CONFIG);
		const tool = spansOf(calls[0]?.body ?? '{}')[2];

		expect(tool?.attrs).toMatchObject({ 'langfuse.observation.level': 'ERROR', 'langfuse.observation.type': 'tool' });
		expect(tool?.status.code).toBe(2);
	});

	/** The course's warning: wrong keys lose traces without a word. Here they say so. */
	it('reports a rejected key instead of pretending, and writes the trace id to stderr', async () => {
		stubFetch({ status: 401 });
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		const result = await sendTrace(sampleTrace().finish({ metadata: {}, output: '' }), CONFIG);

		expect(result).toEqual({ ok: false, reason: 'unauthorized (401)' });
		expect(String(stderr.mock.calls[0]?.[0])).toContain(TRACE_ID);
	});

	it('treats rejected spans inside a 200 (OTLP partial success) as a failure', async () => {
		stubFetch({ body: { partialSuccess: { errorMessage: 'bad span', rejectedSpans: '1' } }, status: 200 });
		vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		const result = await sendTrace(sampleTrace().finish({ metadata: {}, output: '' }), CONFIG);

		expect(result).toEqual({ ok: false, reason: '1 spans rejected: bad span' });
	});

	it('never throws when the tracker is unreachable', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
		);
		vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		await expect(sendTrace(sampleTrace().finish({ metadata: {}, output: '' }), CONFIG)).resolves.toEqual({
			ok: false,
			reason: 'TypeError',
		});
	});

	it('sends nothing at all when tracing is off', async () => {
		const calls = stubFetch({ status: 200 });

		expect((await sendTrace(sampleTrace().finish({ metadata: {}, output: '' }), null)).ok).toBe(false);
		expect(calls).toEqual([]);
	});
});

describe('scores and the connection check', () => {
	it('posts a numeric score on the trace it names', async () => {
		const calls = stubFetch({ body: { id: 'score-1' }, status: 200 });

		const result = await sendScore(
			{ comment: 'полезно', name: 'user_feedback', traceId: 'b'.repeat(32), value: 1 },
			CONFIG,
		);

		expect(result.ok).toBe(true);
		expect(calls[0]?.url).toBe('https://tracker.test/api/public/scores');
		expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
			comment: 'полезно',
			dataType: 'NUMERIC',
			environment: 'test',
			name: 'user_feedback',
			traceId: 'b'.repeat(32),
			value: 1,
		});
	});

	it('tells ok, unauthorized, unreachable and disabled apart', async () => {
		stubFetch({ status: 200 });
		expect(await checkTracing(CONFIG)).toBe('ok');

		stubFetch({ status: 401 });
		expect(await checkTracing(CONFIG)).toBe('unauthorized');

		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
		);
		expect(await checkTracing(CONFIG)).toBe('unreachable');

		expect(await checkTracing(null)).toBe('disabled');
	});
});
