'use client';

import { type ChatMessage, chatResponseSchema, type ToolCall } from '@server/agent/model/agent.schema';
import { useCallback, useState } from 'react';

/**
 * The transcript, and the one call that advances it: POST /api/chat with the whole history.
 *
 * There is no session on the server, so the conversation lives here. That is a deliberate trade
 * for a short-lived product: no auth, no store, no migration — and a reload starts clean, which
 * is what you want between two runs of a demo.
 *
 * The response is parsed rather than trusted. A tool call rendered from an unvalidated shape is
 * how the activity panel ends up printing `undefined` in front of an audience.
 */
export type ChatStatus = 'error' | 'idle' | 'sending';

export interface UseChat {
	error: string | null;
	messages: readonly ChatMessage[];
	retry: () => void;
	send: (content: string) => void;
	status: ChatStatus;
	toolCalls: readonly ToolCall[];
}

export function useChat(): UseChat {
	const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
	const [toolCalls, setToolCalls] = useState<readonly ToolCall[]>([]);
	const [status, setStatus] = useState<ChatStatus>('idle');
	const [error, setError] = useState<string | null>(null);

	const exchange = useCallback(async (history: readonly ChatMessage[]) => {
		setStatus('sending');
		setError(null);

		try {
			const response = await fetch('/api/chat', {
				body: JSON.stringify({ messages: history }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			});

			if (!response.ok) {
				// The route answers with a sentence meant for a person. Showing "Server said 500"
				// instead would throw that away and tell the reader nothing they can act on.
				const failure: unknown = await response.json().catch(() => null);
				const message =
					typeof failure === 'object' && failure !== null && 'message' in failure
						? String(failure.message)
						: `Сервер ответил ${String(response.status)}.`;

				throw new Error(message);
			}

			const parsed = chatResponseSchema.safeParse(await response.json());

			if (!parsed.success) {
				throw new Error('Ответ сервера не совпал с ожидаемой формой.');
			}

			setMessages([...history, { content: parsed.data.reply, role: 'assistant' }]);
			setToolCalls(parsed.data.toolCalls);
			setStatus('idle');
		} catch (cause) {
			// The user's message stays in the transcript, so retry resends it rather than making
			// somebody retype what they already said.
			setError(cause instanceof Error ? cause.message : 'Не удалось связаться с ассистентом.');
			setStatus('error');
		}
	}, []);

	const send = useCallback(
		(content: string) => {
			const history = [...messages, { content, role: 'user' as const }];

			setMessages(history);
			void exchange(history);
		},
		[exchange, messages],
	);

	const retry = useCallback(() => {
		void exchange(messages);
	}, [exchange, messages]);

	return { error, messages, retry, send, status, toolCalls };
}
