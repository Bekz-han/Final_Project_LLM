'use client';

import { Button } from '@shared/ui/Button';
import { Callout } from '@shared/ui/Callout';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { SUGGESTIONS } from '../model/suggestions';
import { useChat } from '../model/useChat';
import { AgentActivity } from './AgentActivity';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

/**
 * The analyst's assistant: a conversation, a composer, and the agent's actual work.
 *
 * Two shapes. Full width it is two columns on a desktop — the activity panel gets equal billing,
 * because it is the argument that this is an agent rather than a chatbot. `compact` stacks it all
 * in one column for a ~400px panel docked beside the graph, with the activity panel folding away.
 *
 * Gids in the replies and in the tool calls are links only when `onGidClick` is given: the widget
 * does not know what a graph is, the screen that docks it does.
 */

export interface AssistantPrefill {
	/** Change it to apply `text` again, even when the text itself is the same as last time. */
	nonce: number;
	text: string;
}

export interface AssistantProps {
	className?: string;
	/** One column, for a side panel. */
	compact?: boolean;
	/** Called with the gid as a string — gids are past 2^53 and must never become numbers. */
	onGidClick?: (gid: string) => void;
	/** Sets the composer's draft whenever `nonce` changes. Never sends. */
	prefill?: AssistantPrefill;
}

export function Assistant({ className, compact = false, onGidClick, prefill }: AssistantProps) {
	const { error, messages, retry, send, status, toolCalls } = useChat();
	const pending = status === 'sending';
	const formRef = useRef<HTMLFormElement>(null);
	const focusDraft = () => {
		formRef.current?.querySelector('textarea')?.focus();
	};

	const [draft, setDraft] = useState(prefill?.text ?? '');
	const [appliedNonce, setAppliedNonce] = useState(prefill?.nonce);

	// Adjusting state while rendering, not in an effect: the draft is right on the first paint
	// after the prop changes, and there is no cascading second render.
	if (prefill !== undefined && prefill.nonce !== appliedNonce) {
		setAppliedNonce(prefill.nonce);
		setDraft(prefill.text);
	}

	// Focus follows a prefill so the analyst can edit or press Enter straight away.
	const prefillNonce = prefill?.nonce;
	useEffect(() => {
		if (prefillNonce !== undefined) formRef.current?.querySelector('textarea')?.focus();
	}, [prefillNonce]);

	const fill = (text: string) => {
		setDraft(text);
		focusDraft();
	};

	const conversation = (
		<>
			<MessageList
				emptyHint="Спросите, например: кого проверять первым и почему?"
				messages={messages}
				onGidClick={onGidClick}
				pending={pending}
			/>

			{error !== null && (
				<Callout tone="danger">
					<div className="flex flex-wrap items-center gap-2">
						<span>{error}</span>
						<Button onClick={retry} size="sm" variant="secondary">
							Повторить
						</Button>
					</div>
				</Callout>
			)}

			<div className="border-border flex flex-col gap-2 border-t pt-3">
				{/* Examples are for an empty conversation; once it has started they only steal height. */}
				{messages.length === 0 && (
					<div aria-label="Примеры вопросов" className="flex flex-wrap gap-1.5" role="group">
						{SUGGESTIONS.map((suggestion) => (
							<Button
								className="h-auto min-h-8 py-1 text-left whitespace-normal"
								disabled={pending}
								key={suggestion}
								onClick={() => {
									fill(suggestion);
								}}
								size="sm"
								variant="secondary"
							>
								{suggestion}
							</Button>
						))}
					</div>
				)}

				<Composer
					disabled={pending}
					draft={draft}
					formRef={formRef}
					onDraftChange={setDraft}
					onSend={send}
					placeholder="Спросите о сети: кто, кому, почему…"
				/>
			</div>
		</>
	);

	if (compact) {
		return (
			<div className={clsx('flex h-full min-h-0 flex-col gap-3', className)}>
				<section
					aria-label="Разговор с ассистентом"
					className="border-border bg-surface flex min-h-[20rem] flex-1 flex-col gap-3 rounded-lg border p-3"
				>
					{conversation}
				</section>

				<AgentActivity collapsible onGidClick={onGidClick} pending={pending} toolCalls={toolCalls} />
			</div>
		);
	}

	return (
		<div className={clsx('grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]', className)}>
			<section
				aria-label="Разговор с ассистентом"
				className="border-border bg-surface flex min-h-[32rem] flex-col gap-3 rounded-lg border p-5"
			>
				{conversation}
			</section>

			<AgentActivity className="h-full" onGidClick={onGidClick} pending={pending} toolCalls={toolCalls} />
		</div>
	);
}
