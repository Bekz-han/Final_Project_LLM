import clsx from 'clsx';

/**
 * One of three or four, all of them visible.
 *
 * A select hides its options behind a click; three roles side by side are read at a glance and
 * chosen in one. Above four options this stops being the right control and a `Select` starts.
 *
 * It is a radio group underneath, not a row of buttons. The staff screen had the row of buttons
 * with `aria-pressed`, which announces "pressed" rather than "one of three selected" and leaves
 * the arrow keys doing nothing — a radio group gets both for free.
 */

export interface SegmentedOption {
	label: string;
	value: string;
}

export interface SegmentedControlProps {
	disabled?: boolean;
	/** Groups the radios, which is what makes them one control rather than three. */
	name: string;
	onChange: (value: string) => void;
	options: readonly SegmentedOption[];
	value: string;
}

export function SegmentedControl({ disabled, name, onChange, options, value }: SegmentedControlProps) {
	return (
		<div className="border-border-strong bg-surface inline-flex w-fit gap-1 rounded-md border p-1">
			{options.map((option) => {
				const selected = option.value === value;

				return (
					<label
						className={clsx(
							'rounded-sm px-3 py-1.5 text-sm transition-colors',
							disabled === true ? 'text-fg-subtle' : 'cursor-pointer',
							selected ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
						)}
						key={option.value}
					>
						<input
							checked={selected}
							className="sr-only"
							disabled={disabled}
							name={name}
							onChange={() => {
								onChange(option.value);
							}}
							type="radio"
							value={option.value}
						/>
						{option.label}
					</label>
				);
			})}
		</div>
	);
}
