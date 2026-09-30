import { runAgent } from '@server/agent/usecase/agent';
import { type Analysis, type RawGraph, type TopRow } from '@server/graph/model/graph.schema';
import { analyze } from '@server/graph/usecase/analyze';
import { type Ctx } from '@server/kernel/ctx';
import { resetEnvCache } from '@server/kernel/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These exercise the scripted adapter, which is the only one that can run in a test without a
 * network or a key — and the one a reviewer runs. It calls the real tools through the real
 * dispatcher, so what is asserted here is the product, not a stub of it.
 *
 * The analysis is a real `analyze` of a small graph, handed to the tools in place of
 * `output/analysis.json`, so the suite does not depend on whether the pipeline ran on this machine.
 */
const source = vi.hoisted(() => ({ analysis: null as Analysis | null }));

vi.mock('@server/graph/usecase/getAnalysis', () => ({ getAnalysis: () => source.analysis }));

const ctx: Ctx = { now: new Date('2026-01-15T09:30:00.000Z') };

const SEED = '100000000000000001';
const PAYEE = '100000000000000002';
const SIDE = '100000000000000003';
const SINK = '100000000000000004';

const RAW: RawGraph = {
	edges: [
		{ depth: 1, dst: PAYEE, nTx: 2, src: SEED, sumKzt: 30_000 },
		{ depth: 1, dst: SIDE, nTx: 1, src: SEED, sumKzt: 7_000 },
		{ depth: 2, dst: SINK, nTx: 1, src: PAYEE, sumKzt: 25_000 },
	],
	nodes: [
		{ depth: 0, gid: SEED, isSeed: true },
		{ depth: 1, gid: PAYEE, isSeed: false },
		{ depth: 1, gid: SIDE, isSeed: false },
		{ depth: 2, gid: SINK, isSeed: false },
	],
	transactions: [
		{ date: '2026-07-03', dst: PAYEE, src: SEED, sumKzt: 10_000 },
		{ date: '2026-07-10', dst: PAYEE, src: SEED, sumKzt: 20_000 },
		{ date: '2026-07-05', dst: SIDE, src: SEED, sumKzt: 7_000 },
		{ date: '2026-07-11', dst: SINK, src: PAYEE, sumKzt: 25_000 },
	],
};

const ANALYSIS = analyze(RAW);

/** The three questions the README and the suggestion chips tell a reviewer to ask. They must not rot. */
const FIRST = 'Кого проверять первым и почему?';
const COLLECT = 'Кто собирает деньги с этих пятерых?';
const REMOVE = 'Что будет, если убрать топ-5?';

function ask(content: string, history: { content: string; role: 'assistant' | 'user' }[] = []) {
	return runAgent(ctx, { messages: [...history, { content, role: 'user' }] });
}

beforeEach(() => {
	process.env.LLM_PROVIDER = 'mock';
	delete process.env.LLM_API_KEY;
	resetEnvCache();
	source.analysis = ANALYSIS;
});

describe('the scripted agent', () => {
	it('answers «кого первым» with the top list, then the card of number one', async () => {
		const result = await ask(FIRST);

		expect(result.toolCalls.map((call) => call.name)).toEqual(['get_top_nodes', 'get_node']);
		expect(result.toolCalls[1]?.arguments).toEqual({ gid: ANALYSIS.top[0]?.gid });
	});

	/** Rule 1: every fact in the reply comes from what a tool returned. */
	it('composes the reply from the tool results: every gid and every reason in it', async () => {
		const result = await ask(FIRST);
		const { rows } = result.toolCalls[0]?.result as { rows: TopRow[] };

		for (const row of rows) {
			expect(result.reply).toContain(row.gid);
			expect(result.reply).toContain(row.why);
		}
	});

	it('takes «этих пятерых» from the gids of the previous answer', async () => {
		const previous = await ask(FIRST);
		const result = await ask(COLLECT, [
			{ content: FIRST, role: 'user' },
			{ content: previous.reply, role: 'assistant' },
		]);

		expect(result.toolCalls.map((call) => call.name)).toEqual(['find_collectors']);
		expect(result.toolCalls[0]?.arguments).toMatchObject({ gids: ANALYSIS.top.slice(0, 5).map((row) => row.gid) });
	});

	it('with no earlier answer, fetches the top five first — visibly, as a tool call', async () => {
		const result = await ask(COLLECT);

		expect(result.toolCalls.map((call) => call.name)).toEqual(['get_top_nodes', 'find_collectors']);
	});

	it('answers «что если убрать топ-5» by removing the top of the list', async () => {
		const result = await ask(REMOVE);

		expect(result.toolCalls.map((call) => call.name)).toEqual(['get_top_nodes', 'simulate_removal']);
		expect(result.reply).toContain('компонент');
	});

	it('takes the sources from the role the question names: «с топ-5 распределителей»', async () => {
		const result = await ask('Кто собирает деньги с топ-5 распределителей?');

		expect(result.toolCalls[0]).toMatchObject({
			arguments: { limit: 5, role: 'distributor' },
			name: 'get_top_nodes',
		});
	});

	it('removes as many as «топ-N» says, not always five', async () => {
		const result = await ask('Что если убрать топ-10?');

		expect(result.toolCalls[0]?.arguments).toEqual({ limit: 10 });
	});

	/** An unrelated question answered with the top list reads as the product ignoring the question. */
	it('says it did not understand an unrelated question, calls nothing, and offers the demo questions', async () => {
		const result = await ask('Какая погода в Астане?');

		expect(result.toolCalls).toEqual([]);
		expect(result.reply).toContain('не распознал');

		for (const question of [FIRST, COLLECT, REMOVE]) expect(result.reply).toContain(question);
	});

	/** «провер», «важн», «топ» alone are everyday words: the top list needs a cue that points at the graph. */
	it.each(['Проверь погоду в Астане', 'Что важнее: контроль или посетить Астану?', 'Топ новостей'])(
		'does not answer the off-topic «%s» with the top list',
		async (question) => {
			const result = await ask(question);

			expect(result.toolCalls).toEqual([]);
			expect(result.reply).toContain('не распознал');

			for (const demo of [FIRST, COLLECT, REMOVE]) expect(result.reply).toContain(demo);
		},
	);

	it('still answers the demo questions with their tool calls', async () => {
		expect((await ask(FIRST)).toolCalls.map((call) => call.name)).toEqual(['get_top_nodes', 'get_node']);
		expect((await ask(COLLECT)).toolCalls.map((call) => call.name)).toEqual(['get_top_nodes', 'find_collectors']);
		expect((await ask(REMOVE)).toolCalls.map((call) => call.name)).toEqual(['get_top_nodes', 'simulate_removal']);
		expect((await ask('Что будет, если убрать топ-10?')).toolCalls.map((call) => call.name)).toEqual([
			'get_top_nodes',
			'simulate_removal',
		]);
		expect((await ask('Какие узлы проверить в первую очередь?')).toolCalls[0]?.name).toBe('get_top_nodes');
	});

	it('explains one named gid through its card', async () => {
		const result = await ask(`Почему ${PAYEE} получил такую роль?`);

		expect(result.toolCalls.map((call) => call.name)).toEqual(['get_node']);
		expect(result.reply).toContain(PAYEE);
	});

	it('every demo call succeeds and carries what the panel renders', async () => {
		for (const question of [FIRST, COLLECT, REMOVE]) {
			// eslint-disable-next-line no-await-in-loop -- three questions, read in order
			const result = await ask(question);

			for (const call of result.toolCalls) {
				expect(call.label.length).toBeGreaterThan(0);
				expect(call.status).toBe('ok');
			}
		}
	});

	/** A refusal is reported, not papered over with a made-up card. */
	it('says the tool refused an unknown gid, and invents nothing about it', async () => {
		const result = await ask('Расскажи про 199999999999999999');

		expect(result.toolCalls[0]?.result).toMatchObject({ refused: true });
		expect(result.reply).toContain('отказал');
		expect(result.reply).not.toContain('Входящих');
	});

	it('says the pipeline has not run, rather than answering from nothing', async () => {
		source.analysis = null;

		const result = await ask(FIRST);

		expect(result.toolCalls[0]?.status).toBe('error');
		expect(result.reply).toContain('pnpm pipeline');
	});

	it('still reads the clock through its tool', async () => {
		const result = await ask('Который час?');
		const time = result.toolCalls[0]?.result as { local: string; timeZone: string };

		expect(result.toolCalls.map((call) => call.name)).toEqual(['get_current_time']);
		expect(result.reply).toContain(time.local);
	});
});
