import { describe, expect, it } from 'vitest';
import { inlineMarkdown } from './inlineMarkdown';

describe('inlineMarkdown', () => {
	it('turns **bold** into a strong segment and keeps the text around it', () => {
		expect(inlineMarkdown('Узел **100000008603629100** — распределитель.')).toEqual([
			{ strong: false, text: 'Узел ' },
			{ strong: true, text: '100000008603629100' },
			{ strong: false, text: ' — распределитель.' },
		]);
	});

	it('drops heading hashes and makes the heading bold', () => {
		expect(inlineMarkdown('### Итог\nтекст')).toEqual([
			{ strong: true, text: 'Итог' },
			{ strong: false, text: '\nтекст' },
		]);
	});

	it('drops inline-code backticks around a gid, inside bold too', () => {
		expect(inlineMarkdown('**Первым `100000000331309100`**.')).toEqual([
			{ strong: true, text: 'Первым 100000000331309100' },
			{ strong: false, text: '.' },
		]);
	});

	it('leaves text without markup as one plain segment', () => {
		expect(inlineMarkdown('1. первый\n2. второй')).toEqual([{ strong: false, text: '1. первый\n2. второй' }]);
	});

	it('does not treat a lone asterisk or an unclosed pair as bold', () => {
		expect(inlineMarkdown('a * b **c')).toEqual([{ strong: false, text: 'a * b **c' }]);
	});
});
