import { chatToolDefinitions, executeTool, responsesToolDefinitions, TOOLS } from '@server/agent/usecase/tools';
import { type Ctx } from '@server/kernel/ctx';
import { describe, expect, it } from 'vitest';

const ctx: Ctx = { now: new Date('2026-01-15T09:30:00.000Z') };

describe('the tool registry', () => {
	it('gives every tool a unique name, because the model addresses them by it', () => {
		const names = TOOLS.map((tool) => tool.name);

		expect(new Set(names).size).toBe(names.length);
	});

	it('derives a JSON Schema for each tool rather than restating it by hand', () => {
		for (const definition of chatToolDefinitions()) {
			expect(definition.function.parameters).toMatchObject({ type: 'object' });
		}
	});

	it('strips $schema, which a validator wants and an inference endpoint does not', () => {
		for (const definition of responsesToolDefinitions()) {
			expect(definition.parameters).not.toHaveProperty('$schema');
		}
	});

	it('offers the same tools in both dialects', () => {
		expect(responsesToolDefinitions().map((tool) => tool.name)).toEqual(
			chatToolDefinitions().map((definition) => definition.function.name),
		);
	});
});

describe('executeTool', () => {
	it('runs a tool and reports success', () => {
		const call = executeTool(ctx, { args: {}, name: 'get_current_time' });

		expect(call.status).toBe('ok');
		expect(call.label).toBe('Часы сервера');
		expect(call.result).toMatchObject({ iso: '2026-01-15T09:30:00.000Z', timeZone: 'UTC' });
	});

	it('reads the clock from ctx and applies the requested zone', () => {
		const call = executeTool(ctx, { args: { timeZone: 'Asia/Almaty' }, name: 'get_current_time' });

		expect(call.result).toMatchObject({ timeZone: 'Asia/Almaty' });
		expect((call.result as { local: string }).local).toContain('14:30');
	});

	it('reports a hallucinated tool name instead of throwing', () => {
		const call = executeTool(ctx, { args: {}, name: 'summon_dragon' });

		expect(call.status).toBe('error');
		expect(call.result).toContain('summon_dragon');
	});

	it('rejects arguments that do not match the schema, rather than passing them through', () => {
		const call = executeTool(ctx, { args: { timeZone: 42 }, name: 'get_current_time' });

		expect(call.status).toBe('error');
	});

	/**
	 * The whole turn dies if this throws, and the activity panel — the one thing an audience is
	 * looking at — goes blank. A failing tool must be a row that says "failed".
	 */
	it('never throws, even when the handler itself does', () => {
		const args = { timeZone: 'Not/A_Zone' };

		expect(() => executeTool(ctx, { args, name: 'get_current_time' })).not.toThrow();
		expect(executeTool(ctx, { args, name: 'get_current_time' }).status).toBe('error');
	});

	it('measures how long the handler took, because the panel shows it', () => {
		expect(executeTool(ctx, { args: {}, name: 'get_current_time' }).durationMs).toBeGreaterThanOrEqual(0);
	});
});
