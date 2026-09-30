'use client';

import { Assistant } from '@widgets/assistant';

/**
 * The assistant on a page of its own, full width.
 *
 * Everything lives in `widgets/assistant` so the same widget can dock beside the graph. There is
 * no graph on this page, so gids render as plain text: a link that focuses nothing would lie.
 */
export interface ChatScreenProps {
	subtitle?: string;
	title?: string;
}

export function ChatScreen({
	subtitle = 'Спросите обычным языком. Ассистент сам выбирает инструменты графа и показывает, что вызвал.',
	title = 'Ассистент',
}: ChatScreenProps) {
	return (
		<div className="flex flex-col gap-4">
			<div>
				<h1 className="text-lg font-semibold">{title}</h1>
				<p className="text-fg-muted text-sm">{subtitle}</p>
			</div>

			<Assistant />
		</div>
	);
}
