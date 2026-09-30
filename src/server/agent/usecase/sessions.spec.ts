import { chatRequestSchema, sessionIdSchema } from '@server/agent/model/agent.schema';
import { loadSession, saveExchange, saveFeedback } from '@server/agent/usecase/sessions';
import { type Ctx } from '@server/kernel/ctx';
import { resetEnvCache } from '@server/kernel/env';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * The course asks that state survive a restart. Here a restart is what it is for this store: the
 * process forgets everything it cached, and the next request reads the files again.
 */

const ctx: Ctx = { now: new Date('2026-10-01T09:00:00.000Z') };
const TRACE_A = 'a'.repeat(32);
const TRACE_B = 'b'.repeat(32);

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'money-graph-state-'));
	process.env.STATE_DIR = dir;
	resetEnvCache();
});

afterEach(() => {
	rmSync(dir, { force: true, recursive: true });
	delete process.env.STATE_DIR;
	resetEnvCache();
});

describe('a stored conversation', () => {
	it('keeps every exchange in order, with the trace id on each answer', () => {
		saveExchange(ctx, { answer: 'Первым — 1…', id: 'session-1', question: 'Кого первым?', traceId: TRACE_A });
		saveExchange(ctx, { answer: 'Собирают…', id: 'session-1', question: 'Кто собирает?', traceId: TRACE_B });

		const session = loadSession(ctx, 'session-1');

		expect(session?.turns.map((turn) => [turn.role, turn.content, turn.traceId])).toEqual([
			['user', 'Кого первым?', undefined],
			['assistant', 'Первым — 1…', TRACE_A],
			['user', 'Кто собирает?', undefined],
			['assistant', 'Собирают…', TRACE_B],
		]);
	});

	it('survives a restart: nothing cached, everything read back from disk', () => {
		saveExchange(ctx, { answer: 'ответ', id: 'session-2', question: 'вопрос', traceId: TRACE_A });

		resetEnvCache();

		expect(loadSession(ctx, 'session-2')?.turns).toHaveLength(2);
	});

	it('is null for a session never written, so a fresh browser starts empty', () => {
		expect(loadSession(ctx, 'never-seen')).toBeNull();
	});

	it('leaves no temporary file behind: the write is a rename', () => {
		saveExchange(ctx, { answer: 'ответ', id: 'session-3', question: 'вопрос', traceId: TRACE_A });

		expect(readdirSync(join(dir, 'sessions'))).toEqual(['session-3.json']);
	});

	it('refuses a corrupt file loudly instead of starting the conversation over', () => {
		saveExchange(ctx, { answer: 'ответ', id: 'session-4', question: 'вопрос', traceId: TRACE_A });
		writeFileSync(join(dir, 'sessions', 'session-4.json'), '{"id": "session-4"', 'utf8');

		expect(() => loadSession(ctx, 'session-4')).toThrow();
	});
});

describe('a rating', () => {
	it('lands on the answer with that trace id and on no other', () => {
		saveExchange(ctx, { answer: 'первый', id: 'rated', question: 'q1', traceId: TRACE_A });
		saveExchange(ctx, { answer: 'второй', id: 'rated', question: 'q2', traceId: TRACE_B });

		expect(saveFeedback(ctx, { id: 'rated', traceId: TRACE_B, value: 0 })).toBe(true);
		expect(loadSession(ctx, 'rated')?.turns.map((turn) => turn.feedback)).toEqual([
			undefined,
			undefined,
			undefined,
			0,
		]);
	});

	it('is refused for an answer the session does not have', () => {
		saveExchange(ctx, { answer: 'ответ', id: 'rated-2', question: 'q', traceId: TRACE_A });

		expect(saveFeedback(ctx, { id: 'rated-2', traceId: TRACE_B, value: 1 })).toBe(false);
		expect(saveFeedback(ctx, { id: 'no-such-session', traceId: TRACE_A, value: 1 })).toBe(false);
	});
});

/** The id becomes a file name: nothing that could climb out of the sessions directory gets through. */
describe('a session id', () => {
	it.each(['../etc/passwd', '..', '.', 'a/b', 'a\\b', '', 'x'.repeat(101)])('rejects %j', (id) => {
		expect(sessionIdSchema.safeParse(id).success).toBe(false);
	});

	it('is checked by the chat request itself', () => {
		const request = { messages: [{ content: 'q', role: 'user' }], sessionId: '../../x' };

		expect(chatRequestSchema.safeParse(request).success).toBe(false);
	});

	it('accepts what the interface mints', () => {
		expect(sessionIdSchema.safeParse('s-2026-10-01-5f3a9c').success).toBe(true);
	});
});
