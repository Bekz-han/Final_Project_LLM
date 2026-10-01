import { isValidIin, isValidLuhn, maskMessages, maskPii, PII_MASK } from '@server/agent/usecase/pii';
import { describe, expect, it } from 'vitest';

/**
 * Two failures matter here, and they pull in opposite directions: an ИИН that reaches the trace,
 * and a gid or an amount that is masked so the analyst's question stops making sense. Most cases
 * below are the second kind, because this product's questions are full of long numbers.
 */

const GID = '100000004520112233';
// Valid by the check digit (weights 1…11).
const IIN = '950101300125';
// The Visa test number: Luhn-valid.
const CARD = '4111111111111111';

describe('isValidIin', () => {
	it('accepts a number whose control digit matches', () => {
		expect(isValidIin(IIN)).toBe(true);
	});

	it('rejects a wrong control digit and a wrong length', () => {
		expect(isValidIin('950101300123')).toBe(false);
		expect(isValidIin('95010130012')).toBe(false);
	});

	it('rejects a round amount that passes the control digit but has no month', () => {
		expect(isValidIin('150000000000')).toBe(false);
	});
});

describe('isValidLuhn', () => {
	it('tells a card number from a near miss', () => {
		expect(isValidLuhn(CARD)).toBe(true);
		expect(isValidLuhn('4111111111111112')).toBe(false);
	});
});

describe('maskPii', () => {
	it('masks an ИИН and reports the kind, not the value', () => {
		const result = maskPii(`Мой ИИН ${IIN}, что по мне в графе?`);

		expect(result.text).toBe(`Мой ИИН ${PII_MASK.iin}, что по мне в графе?`);
		expect(result.found).toEqual({ iin: 1 });
		expect(JSON.stringify(result.found)).not.toContain(IIN);
	});

	it('masks any 12 digits that follow the word ИИН, check digit or not', () => {
		expect(maskPii('ИИН: 950101300123').text).toBe(`ИИН: ${PII_MASK.iin}`);
	});

	it('leaves a gid alone: 18 digits contain twelve, but are not an ИИН', () => {
		const question = `Какая роль у ${GID}?`;

		expect(maskPii(question)).toEqual({ found: {}, text: question });
	});

	it('leaves an unlabelled 12-digit amount alone', () => {
		const question = 'Кто получил больше 150000000000 тенге?';

		expect(maskPii(question).text).toBe(question);
	});

	it('masks a card number, whole or in fours', () => {
		expect(maskPii(`карта ${CARD}`).text).toBe(`карта ${PII_MASK.card}`);
		expect(maskPii('карта 4111 1111 1111 1111').text).toBe(`карта ${PII_MASK.card}`);
	});

	it('masks phones, emails and a KZ IBAN', () => {
		const result = maskPii('звоните +7 701 123 45 67 или 87011234567, пишите a.b@mail.kz, счёт KZ86125KZT5004100100');

		expect(result.text).toBe(
			`звоните ${PII_MASK.phone} или ${PII_MASK.phone}, пишите ${PII_MASK.email}, счёт ${PII_MASK.iban}`,
		);
		expect(result.found).toEqual({ email: 1, iban: 1, phone: 2 });
	});

	it('does not touch a question with nothing personal in it', () => {
		const question = 'Покажи топ-5 клиентов по риску';

		expect(maskPii(question)).toEqual({ found: {}, text: question });
	});
});

describe('maskMessages', () => {
	it('masks the history too, since the browser sends it back every turn', () => {
		const result = maskMessages([
			{ content: `мой ИИН ${IIN}`, role: 'user' },
			{ content: 'Принято.', role: 'assistant' },
			{ content: `а что по ${GID}?`, role: 'user' },
		]);

		expect(result.messages.map((message) => message.content)).toEqual([
			`мой ИИН ${PII_MASK.iin}`,
			'Принято.',
			`а что по ${GID}?`,
		]);
		expect(result.found).toEqual({ iin: 1 });
	});
});
