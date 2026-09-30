import { randomBytes } from 'node:crypto';
import 'server-only';

/**
 * Tracing to Langfuse over OpenTelemetry (OTLP/HTTP JSON), with no SDK.
 *
 * One turn of the agent is one trace: a root span «agent turn» carrying the session, the user, the
 * tags and the turn's input and output; under it one `generation` span per model call with its
 * model, tokens and cost, and one `tool` span per tool call with its arguments and result. The spans
 * are collected in memory during the turn and sent as one OTLP request at its end.
 *
 * Why OTLP and not `/api/public/ingestion`: the ingestion endpoint is deprecated, and for
 * organisations created on or after 16 September 2026 it answers 207 "accepted" and the events never
 * appear — found on 30 September by reading the trace back, which is the check this module now
 * makes possible. Why no SDK: the Langfuse JS SDK is four OpenTelemetry packages and a global
 * provider for what is, here, one POST per turn; a payload we build ourselves is one we can test
 * byte for byte. Attribute names follow Langfuse's OpenTelemetry mapping (`langfuse.*`, `gen_ai.*`).
 *
 * Two rules, both from the course's warning that a tracker with wrong keys loses traces silently:
 *
 * - Nothing here throws into a turn. A tracker outage is logged and the analyst still gets an answer.
 * - Nothing is silent either. A rejected request or rejected spans are written to stderr with the
 *   trace id, and `checkTracing` is called at boot and by `/api/health`.
 *
 * With no keys configured, tracing is off and every call is a no-op — the reviewer's path with
 * `LLM_PROVIDER=mock` needs no account anywhere.
 */

export interface TracingConfig {
	auth: string;
	baseUrl: string;
	/** Tagged on every trace, so a notebook run and a demo never mix in one view. */
	environment: string;
}

/** Read straight from `process.env`: tracing is optional and must not make the env schema fail. */
export function tracingConfig(source: Record<string, string | undefined> = process.env): TracingConfig | null {
	const publicKey = source.LANGFUSE_PUBLIC_KEY?.trim();
	const secretKey = source.LANGFUSE_SECRET_KEY?.trim();

	if (!publicKey || !secretKey) return null;

	// The SDK's newer name first, then the one the course notebook uses.
	const baseUrl = (
		source.LANGFUSE_BASE_URL?.trim() ||
		source.LANGFUSE_HOST?.trim() ||
		'https://cloud.langfuse.com'
	).replace(/\/+$/u, '');

	return {
		auth: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
		baseUrl,
		environment: source.LANGFUSE_TRACING_ENVIRONMENT?.trim() || source.NODE_ENV || 'development',
	};
}

/** An ISO timestamp for a moment measured on the wall clock — not a business date, so not `ctx.now`. */
export function isoNow(): string {
	return new Date().toISOString();
}

type Json = unknown;

export interface TraceStart {
	input: Json;
	metadata: Record<string, Json>;
	name: string;
	sessionId?: string | undefined;
	tags: string[];
	/** 32 hex characters: the OpenTelemetry trace id, which Langfuse uses as the trace's id. */
	traceId: string;
	userId?: string | undefined;
}

export interface GenerationRecord {
	costUsd: { input: number; output: number };
	endTime: string;
	input: Json;
	metadata?: Record<string, Json>;
	model: string;
	name: string;
	output: Json;
	startTime: string;
	usage: { input: number; output: number };
}

export interface SpanRecord {
	endTime: string;
	input: Json;
	/** `ERROR` makes a failed tool call stand out in the trace tree. */
	level: 'DEFAULT' | 'ERROR';
	metadata?: Record<string, Json>;
	name: string;
	output: Json;
	startTime: string;
}

type OtlpValue =
	| { arrayValue: { values: { stringValue: string }[] } }
	| { boolValue: boolean }
	| { doubleValue: number }
	| { stringValue: string };

export interface OtlpSpan {
	attributes: { key: string; value: OtlpValue }[];
	endTimeUnixNano: string;
	kind: number;
	name: string;
	parentSpanId?: string;
	spanId: string;
	startTimeUnixNano: string;
	status: { code: number; message?: string };
	traceId: string;
}

/** What one turn sends: its spans, root first. */
export interface FinishedTrace {
	spans: OtlpSpan[];
	traceId: string;
}

function spanId(): string {
	return randomBytes(8).toString('hex');
}

/** Nanoseconds as a decimal string, the OTLP JSON convention; BigInt keeps the digits a double would round. */
function nanos(iso: string): string {
	return (BigInt(Date.parse(iso)) * 1_000_000n).toString();
}

/** Langfuse reads JSON-valued attributes (input, output, usage) from strings. */
function text(value: Json): string {
	return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

function attributes(pairs: Record<string, Json>): OtlpSpan['attributes'] {
	return Object.entries(pairs)
		.filter(([, value]) => value !== undefined && value !== null)
		.map(([key, value]) => {
			if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
				return {
					key,
					value: { arrayValue: { values: value.map((item) => ({ stringValue: item })) } },
				};
			}

			if (typeof value === 'number') return { key, value: { doubleValue: value } };
			if (typeof value === 'boolean') return { key, value: { boolValue: value } };

			return { key, value: { stringValue: text(value) } };
		});
}

function metadataAttributes(prefix: string, metadata: Record<string, Json> | undefined): Record<string, Json> {
	return Object.fromEntries(Object.entries(metadata ?? {}).map(([key, value]) => [`${prefix}.${key}`, value]));
}

const STATUS_OK = 1;
const STATUS_ERROR = 2;
const KIND_INTERNAL = 1;

/** One turn's trace, built in memory. Cheap to create even when tracing is off. */
export class Trace {
	get id(): string {
		return this.start.traceId;
	}

	private readonly children: OtlpSpan[] = [];

	private readonly rootSpanId = spanId();

	private readonly startedAt = isoNow();

	constructor(private readonly start: TraceStart) {}

	/** The root span, with the turn's final output and measurements, then every child. */
	finish(end: { level?: 'DEFAULT' | 'ERROR'; metadata: Record<string, Json>; output: Json }): FinishedTrace {
		const failed = end.level === 'ERROR';
		const root: OtlpSpan = {
			attributes: attributes({
				'langfuse.observation.input': this.start.input,
				'langfuse.observation.level': end.level ?? 'DEFAULT',
				'langfuse.observation.output': end.output,
				'langfuse.observation.type': 'agent',
				'langfuse.session.id': this.start.sessionId,
				'langfuse.trace.input': this.start.input,
				'langfuse.trace.name': this.start.name,
				'langfuse.trace.output': end.output,
				'langfuse.trace.tags': this.start.tags,
				'langfuse.user.id': this.start.userId,
				...metadataAttributes('langfuse.trace.metadata', { ...this.start.metadata, ...end.metadata }),
			}),
			endTimeUnixNano: nanos(isoNow()),
			kind: KIND_INTERNAL,
			name: this.start.name,
			spanId: this.rootSpanId,
			startTimeUnixNano: nanos(this.startedAt),
			status: failed
				? { code: STATUS_ERROR, message: typeof end.metadata.error === 'string' ? end.metadata.error : 'error' }
				: { code: STATUS_OK },
			traceId: this.start.traceId,
		};

		return { spans: [root, ...this.children], traceId: this.start.traceId };
	}

	generation(record: GenerationRecord): void {
		this.child({
			attributes: {
				'gen_ai.request.model': record.model,
				'langfuse.observation.cost_details': {
					input: record.costUsd.input,
					output: record.costUsd.output,
					total: record.costUsd.input + record.costUsd.output,
				},
				'langfuse.observation.input': record.input,
				'langfuse.observation.model.name': record.model,
				'langfuse.observation.output': record.output,
				'langfuse.observation.type': 'generation',
				'langfuse.observation.usage_details': {
					input: record.usage.input,
					output: record.usage.output,
					total: record.usage.input + record.usage.output,
				},
				...metadataAttributes('langfuse.observation.metadata', record.metadata),
			},
			end: record.endTime,
			error: false,
			name: record.name,
			start: record.startTime,
		});
	}

	span(record: SpanRecord): void {
		this.child({
			attributes: {
				'langfuse.observation.input': record.input,
				'langfuse.observation.level': record.level,
				'langfuse.observation.output': record.output,
				'langfuse.observation.type': 'tool',
				...metadataAttributes('langfuse.observation.metadata', record.metadata),
			},
			end: record.endTime,
			error: record.level === 'ERROR',
			name: record.name,
			start: record.startTime,
		});
	}

	private child(input: {
		attributes: Record<string, Json>;
		end: string;
		error: boolean;
		name: string;
		start: string;
	}): void {
		this.children.push({
			attributes: attributes(input.attributes),
			endTimeUnixNano: nanos(input.end),
			kind: KIND_INTERNAL,
			name: input.name,
			parentSpanId: this.rootSpanId,
			spanId: spanId(),
			startTimeUnixNano: nanos(input.start),
			status: { code: input.error ? STATUS_ERROR : STATUS_OK },
			traceId: this.start.traceId,
		});
	}
}

/** The OTLP request body: one resource, one scope, the trace's spans. */
export function otlpBody(trace: FinishedTrace, environment: string): Record<string, Json> {
	return {
		resourceSpans: [
			{
				resource: {
					attributes: attributes({
						'deployment.environment.name': environment,
						'langfuse.environment': environment,
						'service.name': 'money-graph',
					}),
				},
				scopeSpans: [
					{
						scope: { name: 'money-graph.agent' },
						spans: trace.spans.map((span, index) =>
							// Langfuse maps the environment from the root span's attributes.
							index === 0
								? {
										...span,
										attributes: [...span.attributes, ...attributes({ 'langfuse.environment': environment })],
									}
								: span,
						),
					},
				],
			},
		],
	};
}

export type SendResult = { accepted: number; ok: true } | { ok: false; reason: string };

/** A slow tracker must not become a slow answer. */
const TIMEOUT_MS = 5000;

async function request(
	config: TracingConfig,
	input: { body: Record<string, Json>; path: string },
): Promise<{ error: string } | { payload: Record<string, unknown>; status: number }> {
	try {
		const response = await fetch(`${config.baseUrl}${input.path}`, {
			body: JSON.stringify(input.body),
			headers: {
				authorization: config.auth,
				'content-type': 'application/json',
				// Real-time availability on Langfuse's current ingestion path.
				'x-langfuse-ingestion-version': '4',
			},
			method: 'POST',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

		return { payload, status: response.status };
	} catch (cause) {
		return { error: cause instanceof Error ? cause.name : 'network error' };
	}
}

function verdict(result: Awaited<ReturnType<typeof request>>, sent: number): SendResult {
	if ('error' in result) return { ok: false, reason: result.error };
	if (result.status === 401 || result.status === 403) return { ok: false, reason: `unauthorized (${result.status})` };
	if (result.status < 200 || result.status >= 300) return { ok: false, reason: `HTTP ${result.status}` };

	// OTLP's partial success: a 200 that still rejected some spans is not a success.
	const partial = result.payload.partialSuccess as
		{ errorMessage?: string; rejectedSpans?: number | string } | undefined;
	const rejected = Number(partial?.rejectedSpans ?? 0);

	if (rejected > 0)
		return { ok: false, reason: `${rejected} spans rejected: ${partial?.errorMessage ?? 'no detail'}` };

	return { accepted: sent, ok: true };
}

/** Sends one finished trace. Never throws; a failure is logged with the trace id and returned. */
export async function sendTrace(
	trace: FinishedTrace,
	config: TracingConfig | null = tracingConfig(),
): Promise<SendResult> {
	if (config === null)
		return { ok: false, reason: 'tracing is off: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are not set' };

	const result = verdict(
		await request(config, { body: otlpBody(trace, config.environment), path: '/api/public/otel/v1/traces' }),
		trace.spans.length,
	);

	if (!result.ok) process.stderr.write(`Langfuse did not take trace ${trace.traceId}: ${result.reason}\n`);

	return result;
}

/** A score on a trace: the analyst's thumbs, a rule's verdict, a judge's. */
export async function sendScore(
	score: { comment?: string | undefined; name: string; traceId: string; value: number },
	config: TracingConfig | null = tracingConfig(),
): Promise<SendResult> {
	if (config === null) return { ok: false, reason: 'tracing is off' };

	return verdict(
		await request(config, {
			body: {
				comment: score.comment ?? null,
				dataType: 'NUMERIC',
				environment: config.environment,
				name: score.name,
				traceId: score.traceId,
				value: score.value,
			},
			path: '/api/public/scores',
		}),
		1,
	);
}

export type TracingStatus = 'disabled' | 'ok' | 'unauthorized' | 'unreachable';

/**
 * Asks Langfuse whether these keys work. Without this, wrong keys look exactly like a working
 * tracker that nobody opened — the silence is the failure mode the course warns about.
 */
export async function checkTracing(config: TracingConfig | null = tracingConfig()): Promise<TracingStatus> {
	if (config === null) return 'disabled';

	try {
		const response = await fetch(`${config.baseUrl}/api/public/projects`, {
			headers: { authorization: config.auth },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		if (response.status === 401 || response.status === 403) return 'unauthorized';

		return response.ok ? 'ok' : 'unreachable';
	} catch {
		return 'unreachable';
	}
}
