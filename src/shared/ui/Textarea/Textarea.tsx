import clsx from 'clsx';
import { type TextareaHTMLAttributes } from 'react';
import { CONTROL_BASE } from '../control';

/**
 * Something somebody writes a sentence into.
 *
 * A long free-text field in a one-line input lets the user type a paragraph and then read it back
 * through a slot. Three rows by default, and the browser's own resize handle left alone — a
 * person who writes more wants to see more, and no design reason beats that.
 */
export function Textarea({
	autoComplete = 'off',
	className,
	rows = 3,
	...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return (
		<textarea
			autoComplete={autoComplete}
			className={clsx(CONTROL_BASE, 'min-h-[4.5rem] px-3 py-2 text-base', className)}
			rows={rows}
			{...props}
		/>
	);
}
