import { describe, expect, it } from 'vitest';
import { caretAfterCleaning, digitsOf } from './digits';

/**
 * The rule that keeps letters out of a numeric field.
 *
 * Each case here is a value a real input can hold. `1e5` is the one worth naming: it is a valid
 * value for `type="number"`, which is why this component does not use one.
 */
describe('digitsOf', () => {
	it('keeps digits and drops everything else', () => {
		expect(digitsOf('45')).toBe('45');
		expect(digitsOf('4ы5')).toBe('45');
		expect(digitsOf('1e5')).toBe('15');
		expect(digitsOf('-7')).toBe('7');
		expect(digitsOf('4,5')).toBe('45');
		expect(digitsOf(' 60 ')).toBe('60');
		expect(digitsOf('abc')).toBe('');
		expect(digitsOf('')).toBe('');
	});

	it('drops digits that are not the ones a schema can parse', () => {
		// Arabic-indic numerals render as numbers and are not what `Number()` reads.
		expect(digitsOf('٤٥')).toBe('');
	});
});

describe('caretAfterCleaning', () => {
	it('keeps the caret where the person was typing', () => {
		// "12ы34" with the caret after the "ы": three characters in, two of them digits.
		expect(caretAfterCleaning('12ы34', 3)).toBe(2);
		expect(caretAfterCleaning('1234', 2)).toBe(2);
		expect(caretAfterCleaning('ыыы', 3)).toBe(0);
		expect(caretAfterCleaning('45', 2)).toBe(2);
	});
});
