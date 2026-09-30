import clsx from 'clsx';
import { type ChangeEvent, type InputHTMLAttributes } from 'react';
import { CONTROL_BASE } from '../control';
import { caretAfterCleaning, digitsOf } from './digits';

/**
 * A whole number, and nothing else.
 *
 * A numeric box accepted letters because it was a text input with
 * `inputMode="numeric"` — a hint to a phone keyboard and a suggestion to nobody else. This one
 * refuses rather than complains: anything that is not a digit is dropped as it is typed, so the
 * field cannot hold a value the schema will reject.
 *
 * **Not `type="number"`**, deliberately. Browsers accept `e`, `+` and `-` in it — `1e5` is a
 * valid number input — its spinner steals a scroll gesture over a table, and a non-numeric value
 * reads back as an empty string, which hides the mistake instead of showing it. A text input
 * with `inputMode="numeric"` gets the phone keypad and keeps the value honest.
 *
 * `min` and `max` are not enforced here. They belong to the schema, which is what the server
 * parses; this component's job is the alphabet, not the range — a field that silently clamped
 * 500 to 120 while somebody typed would be worse than one that lets the schema say so.
 */

export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function NumberInput({ className, onChange, ...props }: NumberInputProps) {
	function handle(event: ChangeEvent<HTMLInputElement>) {
		// The value is corrected on the element before anybody reads it, so the field, the form
		// state and the schema all see the same digits. This is what a masked input does; the
		// alternative is a controlled value per screen, which is four places to get it wrong.
		//
		// The caret has to be put back by hand: assigning to `value` sends it to the end, so
		// typing a letter into the middle of "1234" would move the caret past the last digit and
		// drop the next keystroke somewhere nobody asked for.
		const caret = caretAfterCleaning(event.target.value, event.target.selectionStart ?? event.target.value.length);

		event.target.value = digitsOf(event.target.value);
		event.target.setSelectionRange(caret, caret);
		onChange?.(event);
	}

	return (
		<input
			autoComplete="off"
			className={clsx(CONTROL_BASE, 'tabular h-9 px-3 text-base', className)}
			inputMode="numeric"
			onChange={handle}
			type="text"
			{...props}
		/>
	);
}
