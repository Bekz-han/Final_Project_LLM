'use client';

import {
	type ChatMessage,
	chatResponseSchema,
	sessionSchema,
	type StoredTurn,
	type ToolCall,
} from '@server/agent/model/agent.schema';
import { useCallback, useEffect, useState } from 'react';

/**
 * The transcript, and the calls that advance it: POST /api/chat with the whole history, and the
 * analyst's rating of an answer.
 *
 * The conversation is kept on the server under a session id this browser remembers, so a reload —
 * or a restart of the service — brings it back. The agent itself is still stateless: every question
 * goes out with the whole history, exactly as before, and the server stores the record.
 *
 * The response is parsed rather than trusted. A tool call rendered from an unvalidated shape is
 * how the activity panel ends up printing `undefined` in front of an audience.
 */
export type ChatStatus = 'error' | 'idle' | 'restoring' | 'sending';

/** A message as the interface holds it: what the model sees, plus what the analyst can rate. */
export type ChatTurn = ChatMessage & Pick<StoredTurn, 'feedback' | 'traceId'>;

export interface UseChat {
	error: string | null;
	messages: readonly ChatTurn[];
	/** Rates the assistant message at `index`: 1 useful, 0 not. */
	rate: (index: number, value: 0 | 1) => void;
	/** Forgets this conversation and starts a new one. The old one stays on the server. */
	reset: () => void;
	retry: () => void;
	send: (content: string) => void;
	status: ChatStatus;
	toolCalls: readonly ToolCall[];
}

const SESSION_KEY = 'money-graph.session';

/** Who asks, for the trace. One analyst per browser until there is sign-in. */
const USER_ID = 'analyst';

function mintSessionId(): string {
	return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Storage can be off, full or forbidden; the chat must work anyway, just without memory. */
function rememberedSession(): string {
	try {
		const known = window.localStorage.getItem(SESSION_KEY);

		if (known !== null && known.length > 0) return known;

		const minted = mintSessionId();

		window.localStorage.setItem(SESSION_KEY, minted);

		return minted;
	} catch {
		return mintSessionId();
	}
}

function forgetSession(): string {
	const minted = mintSessionId();

	try {
		window.localStorage.setItem(SESSION_KEY, minted);
	} catch {
		// Nothing to do: the new id lives for this page only.
	}

	return minted;
}

export function useChat(): UseChat {
	// Read once, lazily. The id is never rendered, so the server's `null` and the browser's value
	// cannot disagree in the markup, and there is no effect setting state on mount.
	const [sessionId, setSessionId] = useState<string | null>(() =>
		typeof window === 'undefined' ? null : rememberedSession(),
	);
	const [messages, setMessages] = useState<readonly ChatTurn[]>([]);
	const [toolCalls, setToolCalls] = useState<readonly ToolCall[]>([]);
	const [status, setStatus] = useState<ChatStatus>('restoring');
	const [error, setError] = useState<string | null>(null);

	// Restore the stored conversation for this session. After «Новый диалог» the new id has none,
	// the server says 404, and the empty conversation stays empty.
	useEffect(() => {
		if (sessionId === null) return undefined;

		let live = true;

		void fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
			.then(async (response) => {
				if (!response.ok) return;

				const parsed = sessionSchema.safeParse(await response.json());

				if (live && parsed.success) {
					setMessages(
						parsed.data.turns.map((turn) => ({
							content: turn.content,
							feedback: turn.feedback,
							role: turn.role,
							traceId: turn.traceId,
						})),
					);
				}
			})
			// A conversation that cannot be restored starts empty; that is not worth an error.
			.catch(() => undefined)
			.finally(() => {
				if (live) setStatus('idle');
			});

		return () => {
			live = false;
		};
	}, [sessionId]);

	const exchange = useCallback(
		async (history: readonly ChatTurn[]) => {
			setStatus('sending');
			setError(null);

			try {
				const response = await fetch('/api/chat', {
					body: JSON.stringify({
						messages: history.map(({ content, role }) => ({ content, role })),
						...(sessionId === null ? {} : { sessionId }),
						userId: USER_ID,
					}),
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

				setMessages([...history, { content: parsed.data.reply, role: 'assistant', traceId: parsed.data.traceId }]);
				setToolCalls(parsed.data.toolCalls);
				setStatus('idle');
			} catch (cause) {
				// The user's message stays in the transcript, so retry resends it rather than making
				// somebody retype what they already said.
				setError(cause instanceof Error ? cause.message : 'Не удалось связаться с ассистентом.');
				setStatus('error');
			}
		},
		[sessionId],
	);

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

	const rate = useCallback(
		(index: number, value: 0 | 1) => {
			const target = messages[index];

			if (target?.role !== 'assistant' || target.traceId === undefined) return;

			const previous = target.feedback;
			const mark = (feedback: 0 | 1 | undefined) => {
				setMessages((current) => current.map((turn, at) => (at === index ? { ...turn, feedback } : turn)));
			};

			// Shown at once; put back if neither the conversation nor the tracker kept it.
			mark(value);

			void fetch('/api/feedback', {
				body: JSON.stringify({ traceId: target.traceId, value, ...(sessionId === null ? {} : { sessionId }) }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
				.then((response) => {
					if (!response.ok) mark(previous);
				})
				.catch(() => {
					mark(previous);
				});
		},
		[messages, sessionId],
	);

	const reset = useCallback(() => {
		setSessionId(forgetSession());
		setMessages([]);
		setToolCalls([]);
		setError(null);
		setStatus('idle');
	}, []);

	return { error, messages, rate, reset, retry, send, status, toolCalls };
}
