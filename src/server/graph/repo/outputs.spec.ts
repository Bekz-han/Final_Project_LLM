import { toCsv } from '@server/graph/repo/outputs';
import { describe, expect, it } from 'vitest';

interface Sample {
	flags: string[];
	gid: string;
	note: string;
	ratio: number | null;
	seed: boolean;
}

const COLUMNS = [
	['gid', (row: Sample) => row.gid],
	['note', (row: Sample) => row.note],
	['ratio', (row: Sample) => row.ratio],
	['seed', (row: Sample) => row.seed],
	['flags', (row: Sample) => row.flags],
] as const;

describe('toCsv', () => {
	it('writes the header from the column names, in order, and one line per row', () => {
		const csv = toCsv(COLUMNS, [{ flags: [], gid: '100000000000000001', note: 'ok', ratio: 0.5, seed: true }]);

		expect(csv).toBe('gid,note,ratio,seed,flags\n100000000000000001,ok,0.5,true,\n');
	});

	/**
	 * `evidence` is free Russian text with numbers and commas: «получает от 11 плательщиков, отдаёт
	 * 3%». An unquoted comma there shifts every column after it by one, and the file still opens.
	 */
	it('quotes a field holding a comma, a quote or a line break, doubling the quotes inside', () => {
		const csv = toCsv(COLUMNS, [
			{ flags: [], gid: '1', note: 'получает от 11, отдаёт "3%"', ratio: null, seed: false },
			{ flags: [], gid: '2', note: 'two\nlines', ratio: 1, seed: false },
		]);

		expect(csv).toBe(
			'gid,note,ratio,seed,flags\n1,"получает от 11, отдаёт ""3%""",,false,\n2,"two\nlines",1,false,\n',
		);
	});

	it('writes a list as one cell joined with |, the separator the plan fixes for top_gids', () => {
		const csv = toCsv(COLUMNS, [{ flags: ['seed', 'truncated'], gid: '1', note: '', ratio: 0, seed: true }]);

		expect(csv).toBe('gid,note,ratio,seed,flags\n1,,0,true,seed|truncated\n');
	});

	it('writes a gid as plain digits, never in scientific notation', () => {
		const csv = toCsv(COLUMNS, [{ flags: [], gid: '100000008680731100', note: '', ratio: null, seed: false }]);

		expect(csv).toContain('\n100000008680731100,');
		expect(csv).not.toMatch(/e\+/);
	});
});
