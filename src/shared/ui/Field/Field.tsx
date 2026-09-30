import clsx from 'clsx';
import { Label } from 'radix-ui';
import { type ReactNode, useId } from 'react';

/**
 * A label, a control and the thing that went wrong with it.
 *
 * The three are together because they have to agree: the label points at the control, the
 * error is announced with it, and `aria-invalid` is set on it. Left to each screen, one of
 * those three is always missing — usually the one a screen reader needed.
 *
 * The control is a render prop rather than `children`, because `Field` owns the id and has to
 * hand it down. Radix's `Label` is used for the same reason it is used everywhere else: the
 * click-to-focus and the `htmlFor` wiring are already correct in it.
 */
export interface FieldProps {
	children: (props: { 'aria-describedby': string | undefined; 'aria-invalid': boolean; id: string }) => ReactNode;
	error?: string;
	hint?: string;
	label: string;
}

export function Field({ children, error, hint, label }: FieldProps) {
	const id = useId();
	const messageId = `${id}-message`;
	const message = error ?? hint;

	return (
		<div className="flex flex-col gap-1.5">
			<Label.Root className="text-fg text-sm font-medium" htmlFor={id}>
				{label}
			</Label.Root>

			{children({
				'aria-describedby': message === undefined ? undefined : messageId,
				'aria-invalid': error !== undefined,
				id,
			})}

			{message !== undefined && (
				<p className={clsx('text-xs', error === undefined ? 'text-fg-muted' : 'text-danger')} id={messageId}>
					{message}
				</p>
			)}
		</div>
	);
}
