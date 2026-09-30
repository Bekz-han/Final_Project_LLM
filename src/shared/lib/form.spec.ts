import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldErrors } from './form';

/**
 * The shape check, not `instanceof`.
 *
 * A `ZodError` crossing a Server Action boundary has been serialised and rebuilt, and two
 * copies of zod in one graph make `instanceof` answer no to an object that is plainly one.
 * These tests use a real `ZodError` and a hand-made lookalike on purpose — both must work,
 * because in production only the second kind ever arrives.
 */

const schema = z.object({
	email: z.email('That does not look like an email address.'),
	name: z.string().min(1, 'Enter a name.'),
});

function caught(input: unknown): unknown {
	try {
		schema.parse(input);

		return null;
	} catch (error) {
		return error;
	}
}

describe('fieldErrors', () => {
	it('puts each complaint under the field it is about', () => {
		expect(fieldErrors(caught({ email: 'no', name: '' }))).toEqual({
			email: 'That does not look like an email address.',
			name: 'Enter a name.',
		});
	});

	it('reads a rebuilt error that is no longer a ZodError', () => {
		// What actually crosses the boundary: the class is gone, the issues are not.
		const rebuilt = { issues: [{ message: 'Enter a surname.', path: ['lastName'] }] };

		expect(fieldErrors(rebuilt)).toEqual({ lastName: 'Enter a surname.' });
	});

	it('keeps the first complaint about a field rather than the last', () => {
		const many = {
			issues: [
				{ message: 'Enter a name.', path: ['firstName'] },
				{ message: 'Name is longer than 80 characters.', path: ['firstName'] },
			],
		};

		expect(fieldErrors(many)).toEqual({ firstName: 'Enter a name.' });
	});

	it('joins a nested path so the message finds its input', () => {
		const nested = { issues: [{ message: 'That does not look like a date.', path: ['contact', 'bornOn'] }] };

		expect(fieldErrors(nested)).toEqual({ 'contact.bornOn': 'That does not look like a date.' });
	});

	it('has nothing to say about an error that is not a validation failure', () => {
		expect(fieldErrors(new Error('the server fell over'))).toBeUndefined();
		expect(fieldErrors(null)).toBeUndefined();
		expect(fieldErrors('a string')).toBeUndefined();
	});

	it('has nothing to say when the complaint is about the object and not a field', () => {
		// A refinement on the whole object carries an empty path. There is no input to mark,
		// so it stays a message above the form rather than becoming a field named "".
		expect(fieldErrors({ issues: [{ message: 'One of the two is required.', path: [] }] })).toBeUndefined();
	});
});
