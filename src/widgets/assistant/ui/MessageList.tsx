'use client';

import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { type ChatTurn } from '../model/useChat';
import { GidText } from './GidText';

/** The agent is thinking: same bubble geometry as a real reply, so the column does not jump. */
function PendingBubble() {
	return (
		<li className="flex items-end gap-2">
			<Avatar colorKey="agent" name="Ассистент" size="sm" />

			<div className="bg-surface border-border max-w-[85%] rounded-lg rounded-bl-none border px-3 py-2">
				<div className="flex gap-1" role="status">
					<span className="sr-only">Ассистент работает</span>
					<span className="bg-fg-subtle size-1.5 animate-pulse rounded-full" />
					<span className="bg-fg-subtle size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
					<span className="bg-fg-subtle size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
				</div>
			</div>
		</li>
	);
}

/**
 * 👍 / 👎 under an answer. The pressed one is marked by shape (a bordered button) and by
 * `aria-pressed`, not by colour alone, and by a word once chosen.
 */
function Rating({ feedback, onRate }: { feedback: 0 | 1 | undefined; onRate: (value: 0 | 1) => void }) {
	const options = [
		{ emoji: '👍', label: 'Полезный ответ', value: 1 },
		{ emoji: '👎', label: 'Бесполезный ответ', value: 0 },
	] as const;

	return (
		<div aria-label="Оценка ответа" className="flex items-center gap-1" role="group">
			{options.map((option) => (
				<Button
					aria-label={option.label}
					aria-pressed={feedback === option.value}
					className="h-7 px-2"
					key={option.value}
					onClick={() => {
						onRate(option.value);
					}}
					size="sm"
					variant={feedback === option.value ? 'secondary' : 'ghost'}
				>
					{option.emoji}
				</Button>
			))}
			{feedback !== undefined && (
				<span className="text-fg-subtle text-xs">
					{feedback === 1 ? 'отмечено: полезно' : 'отмечено: не помогло'}
				</span>
			)}
		</div>
	);
}

export interface MessageListProps {
	emptyHint: string;
	messages: readonly ChatTurn[];
	onGidClick?: (gid: string) => void;
	/** Rating an answer; without it the buttons are not shown. */
	onRate?: (index: number, value: 0 | 1) => void;
	pending: boolean;
}

export function MessageList({ emptyHint, messages, onGidClick, onRate, pending }: MessageListProps) {
	const endRef = useRef<HTMLLIElement>(null);

	// In a side panel the newest reply is below the fold unless the list follows it.
	useEffect(() => {
		endRef.current?.scrollIntoView({ block: 'end' });
	}, [messages.length, pending]);

	if (messages.length === 0 && !pending) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
				<p className="text-fg font-medium">Начните разговор</p>
				<p className="text-fg-muted text-sm">{emptyHint}</p>
			</div>
		);
	}

	return (
		<ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
			{messages.map((message, index) => {
				const mine = message.role === 'user';

				return (
					<li
						className={clsx('flex items-end gap-2', mine && 'flex-row-reverse')}
						key={`${message.role}-${String(index)}`}
					>
						<Avatar colorKey={mine ? 'you' : 'agent'} name={mine ? 'Вы' : 'Ассистент'} size="sm" />

						<div className={clsx('flex max-w-[85%] flex-col gap-1', mine ? 'items-end' : 'items-start')}>
							<div
								className={clsx(
									'rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap',
									mine
										? 'bg-accent text-on-accent rounded-br-none'
										: 'bg-surface text-fg border-border rounded-bl-none border',
								)}
							>
								{/* Only the assistant's gids are links: they come from tool results. */}
								{mine ? message.content : <GidText onGidClick={onGidClick} text={message.content} />}
							</div>

							{!mine && message.traceId !== undefined && onRate !== undefined && (
								<Rating
									feedback={message.feedback}
									onRate={(value) => {
										onRate(index, value);
									}}
								/>
							)}
						</div>
					</li>
				);
			})}

			{pending && <PendingBubble />}
			<li aria-hidden ref={endRef} />
		</ul>
	);
}
