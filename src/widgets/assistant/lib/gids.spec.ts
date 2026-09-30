import { describe, expect, it } from 'vitest';
import { collectGids, isGid, splitGids } from './gids';

const GID = '100000003684369100';

describe('splitGids', () => {
	it('finds a 17-digit gid inside Russian text and keeps the rest as text', () => {
		expect(splitGids('Проверьте узел 10000000368436910 первым.')).toEqual([
			{ kind: 'text', text: 'Проверьте узел ' },
			{ gid: '10000000368436910', kind: 'gid' },
			{ kind: 'text', text: ' первым.' },
		]);
	});

	it('accepts punctuation around a gid', () => {
		const gids = splitGids(`(${GID}), «${GID}»; #${GID}: ${GID}.`)
			.filter((segment) => segment.kind === 'gid')
			.map((segment) => segment.gid);

		expect(gids).toEqual([GID, GID, GID, GID]);
	});

	it('leaves short numbers as text', () => {
		expect(splitGids('81 узел из 2248, доля 12.5%')).toEqual([{ kind: 'text', text: '81 узел из 2248, доля 12.5%' }]);
	});

	it('does not match a gid glued to a letter, even a Cyrillic one', () => {
		expect(splitGids(`узел${GID}`)).toEqual([{ kind: 'text', text: `узел${GID}` }]);
		expect(splitGids(`${GID}abc`)).toEqual([{ kind: 'text', text: `${GID}abc` }]);
	});

	it('does not cut a gid out of a longer run of digits', () => {
		const tooLong = '1234567890123456789012345';

		expect(splitGids(tooLong)).toEqual([{ kind: 'text', text: tooLong }]);
	});

	it('round-trips: joining the segments gives the input back', () => {
		const text = `Топ-1: ${GID}, топ-2: 100000003684369101.`;
		const joined = splitGids(text)
			.map((segment) => (segment.kind === 'gid' ? segment.gid : segment.text))
			.join('');

		expect(joined).toBe(text);
	});

	it('keeps the gid as the exact string, never a rounded number', () => {
		const [segment] = splitGids('100000003684369101');

		expect(segment).toEqual({ gid: '100000003684369101', kind: 'gid' });
		// The number it would have become is a different id.
		expect(String(Number('100000003684369101'))).not.toBe('100000003684369101');
	});
});

describe('isGid', () => {
	it('is true only for a whole gid-shaped string', () => {
		expect(isGid(GID)).toBe(true);
		expect(isGid('2248')).toBe(false);
		expect(isGid(`${GID} `)).toBe(false);
	});
});

describe('collectGids', () => {
	it('finds gids nested in a tool result, in first-seen order, deduplicated', () => {
		const result = {
			clusters: [{ members: [{ gid: '100000000000000001', role: 'collector' }], size: 81 }],
			removed: ['100000000000000002', '100000000000000003'],
			sources: ['100000000000000004'],
			summary: `Собирает с 100000000000000005 и 100000000000000001.`,
			topGids: ['100000000000000001'],
			total: 2248,
		};

		expect(collectGids(result)).toEqual([
			'100000000000000001',
			'100000000000000002',
			'100000000000000003',
			'100000000000000004',
			'100000000000000005',
		]);
	});

	it('trusts gid keys for digit strings of any length, but not other keys', () => {
		expect(collectGids({ gids: ['42'], note: '42' })).toEqual(['42']);
		expect(collectGids({ gid: 'не gid' })).toEqual([]);
	});

	it('skips numbers, which have already lost precision', () => {
		// eslint-disable-next-line no-loss-of-precision -- the point of the test is the rounding
		expect(collectGids({ gid: 100000000000000001 })).toEqual([]);
	});

	it('handles primitives and empty values', () => {
		expect(collectGids(null)).toEqual([]);
		expect(collectGids(undefined)).toEqual([]);
		expect(collectGids(GID)).toEqual([GID]);
		expect(collectGids([])).toEqual([]);
	});
});
