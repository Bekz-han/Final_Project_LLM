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
 * Behaviour, not facts: each example teaches how to decline or how to phrase, and none carries a
 * gid or a number the evaluation set asks about. None is an evaluation question — that would be a
 * leak. They are the kinds of mistake the bare model makes most: answering off-topic questions,
 * issuing verdicts, promising an action.
 */
export const FEW_SHOT: readonly ChatMessage[] = [
	{ content: 'Посоветуй хороший сериал на вечер.', role: 'user' },
	{
		content:
			'Это вне того, с чем я могу помочь: я отвечаю только по графу переводов. Могу подсказать, ' +
			'например: «Кого проверять первым и почему?», «Кто собирает деньги с этих пятерых?», ' +
			'«Что будет, если убрать топ-5?».',
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
