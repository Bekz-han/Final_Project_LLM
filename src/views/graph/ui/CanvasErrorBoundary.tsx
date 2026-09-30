'use client';

import { Button } from '@shared/ui/Button';
import { Callout } from '@shared/ui/Callout';
import { Component, type ReactNode } from 'react';

/**
 * Catches the canvas failing — in practice, WebGL being unavailable or disabled, which sigma
 * reports by throwing from its constructor.
 *
 * Only the canvas goes: the search, the node card and both tables work without it, so the analyst
 * can still answer "who first, and why" from the lists. A class, because React still has no hook
 * for catching a render error.
 */
interface CanvasErrorBoundaryProps {
	children: ReactNode;
}

interface CanvasErrorBoundaryState {
	failed: boolean;
}

export class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
	constructor(props: CanvasErrorBoundaryProps) {
		super(props);
		this.state = { failed: false };
	}

	static getDerivedStateFromError(): CanvasErrorBoundaryState {
		return { failed: true };
	}

	override render() {
		const { failed } = this.state;
		const { children } = this.props;

		if (!failed) return children;

		return (
			<div className="flex h-full items-center justify-center p-6">
				<Callout tone="danger">
					<div className="flex flex-col items-start gap-2">
						<span>
							Не удалось отрисовать граф: браузер не дал WebGL или он отключён. Поиск, карточка узла и таблицы
							справа продолжают работать.
						</span>
						<Button onClick={() => this.setState({ failed: false })} size="sm" variant="secondary">
							Попробовать снова
						</Button>
					</div>
				</Callout>
			</div>
		);
	}
}
