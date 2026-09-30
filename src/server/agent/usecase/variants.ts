import { type ChatMessage, type Variant } from '@server/agent/model/agent.schema';
import { type Analysis } from '@server/graph/model/graph.schema';
import 'server-only';
import { promptWithContext, promptWithoutData, systemPrompt } from './prompt';

/**
 * What each rung of the ladder hands the model. See `VARIANTS` in `agent.schema.ts`.
 *
 * One change per rung, and this table is where that is kept honest:
 *
 * | rung    | system prompt                 | few-shot | tools |
 * | ------- | ----------------------------- | -------- | ----- |
 * | step0   | none                          | no       | no    |
 * | step1   | contract, no data             | yes      | no    |
 * | step1b  | contract + analysis summary   | yes      | no    |
 * | step2   | contract, facts from tools    | yes      | yes   |
 */
export interface VariantSetup {
	/** Worked examples placed before the conversation. */
	fewShot: readonly ChatMessage[];
	/** `null` for the bare model: no system message at all, not an empty one. */
	system: string | null;
	tools: boolean;
}

/**
 * Behaviour, not facts: each example teaches how to read a question or how to decline, and none
 * carries a fact the evaluation set asks about. None is an evaluation question — that would be a
 * leak.
 *
 * Chosen from the zone where the bare model fails (the step-0 pilot, 30 September): it read an
 * 18-digit client id as an amount of money or as a plain number to spell out, and it read the
 * domain's words — распределитель, консолидатор — as electrical or logistics terms. The first
 * example fixes both at once. Its gid is in neither the analysis nor the evaluation set, and the
 * right answer — «такого клиента нет» — is right with no data (step 1) and with tools (step 2), so
 * the example does not tilt one rung against the other. The other two are the verdict and the
 * action the product must never give.
 */
export const FEW_SHOT: readonly ChatMessage[] = [
	{ content: 'Сколько денег получил 100000001111111100?', role: 'user' },
	{
		content:
			'100000001111111100 — это идентификатор клиента в графе переводов, а не сумма. Клиента с таким ' +
			'gid в анализе нет, поэтому назвать, сколько он получил, я не могу. Проверьте номер: gid ' +
			'копируется целиком, все 18 цифр.',
		role: 'assistant',
	},
	{ content: 'Скажи прямо: этот клиент отмывает деньги, да?', role: 'user' },
	{
		content:
			'Вывода о виновности я не делаю: граф показывает признаки, а не умысел. Могу описать, какие ' +
			'признаки у клиента есть — роль, связи, объёмы, — и почему он в приоритете проверки. Решение ' +
			'остаётся за аналитиком.',
		role: 'assistant',
	},
	{ content: 'Отправь по нему сообщение в финмониторинг.', role: 'user' },
	{
		content:
			'Я ничего не отправляю и не меняю: я только читаю анализ. Сообщение в финмониторинг ' +
			'оформляет аналитик в своей системе. Могу собрать по клиенту сводку с цифрами, чтобы её ' +
			'было проще приложить.',
		role: 'assistant',
	},
];

export function variantSetup(variant: Variant, analysis: Analysis | null): VariantSetup {
	const stats = analysis?.stats ?? null;

	switch (variant) {
		case 'step0':
			return { fewShot: [], system: null, tools: false };

		case 'step1':
			return { fewShot: FEW_SHOT, system: promptWithoutData(stats), tools: false };

		case 'step1b':
			// No analysis means no summary to paste; fall back to step 1 rather than invent one.
			return {
				fewShot: FEW_SHOT,
				system: analysis === null ? promptWithoutData(stats) : promptWithContext(analysis),
				tools: false,
			};

		case 'step2':
		default:
			return { fewShot: FEW_SHOT, system: systemPrompt(stats), tools: true };
	}
}
