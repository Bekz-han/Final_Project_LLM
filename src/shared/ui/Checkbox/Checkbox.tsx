import clsx from 'clsx';
import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

/**
 * A yes/no with a label that is part of the target.
 *
 * The label wraps the box rather than sitting next to it, so the words are clickable too: a
 * 16px square on its own is under the 24×24 floor WCAG 2.2 SC 2.5.8 puts on a pointer target,
 * and the row around it is what makes the target big enough to hit.
 *
 * A native `<input type="checkbox">` with `accent-color`, not a div dressed as one. It is
 * already correct with a keyboard, with a screen reader, with a form reset and with the
 * platform's own high-contrast mode, and none of that is worth rebuilding to change a tick.
 */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
	children: ReactNode;
}

export function Checkbox({ children, className, disabled, ...props }: CheckboxProps) {
	const id = useId();

	return (
		<label
			className={clsx(
				'text-fg flex items-center gap-2 text-sm',
				disabled === true ? 'text-fg-subtle' : 'cursor-pointer',
				className,
			)}
			htmlFor={id}
		>
			<input
				className="accent-accent size-4 shrink-0 cursor-pointer disabled:cursor-default"
				disabled={disabled}
				id={id}
				type="checkbox"
				{...props}
			/>
			{children}
		</label>
	);
}
