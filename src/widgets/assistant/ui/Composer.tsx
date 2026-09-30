'use client';

import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Button } from '@shared/ui/Button';
import { Textarea } from '@shared/ui/Textarea';
import { type FormEvent, type KeyboardEvent, type Ref } from 'react';

/**
 * A draft, and a button that sends it. Nothing writes on `change`.
 *
 * The draft is owned by the caller, because a suggestion chip or a «Спросить ассистента» button
 * elsewhere on the screen fills it in — and filling it in must never send it.
 *
 * Enter sends and Shift+Enter breaks the line, because on stage the demo is typed, not clicked.
 */
export interface ComposerProps {
	disabled: boolean;
	draft: string;
	/** On the form: the shared `Textarea` does not forward a ref, so focus goes through this. */
	formRef?: Ref<HTMLFormElement>;
	onDraftChange: (draft: string) => void;
	onSend: (content: string) => void;
	placeholder: string;
}

export function Composer({ disabled, draft, formRef, onDraftChange, onSend, placeholder }: ComposerProps) {
	const empty = draft.trim().length === 0;

	function submit(event?: FormEvent) {
		event?.preventDefault();
		if (empty || disabled) return;

		onSend(draft.trim());
		onDraftChange('');
	}

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	};

	return (
		<form className="flex items-end gap-2" onSubmit={submit} ref={formRef}>
			<Textarea
				aria-label="Сообщение"
				className="min-h-[2.75rem] flex-1 resize-none"
				disabled={disabled}
				onChange={(event) => {
					onDraftChange(event.target.value);
				}}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				rows={2}
				value={draft}
			/>

			<Button aria-label="Отправить" disabled={disabled || empty} type="submit">
				<PaperAirplaneIcon aria-hidden className="size-4" />
				<span className="sr-only sm:not-sr-only">Отправить</span>
			</Button>
		</form>
	);
}
