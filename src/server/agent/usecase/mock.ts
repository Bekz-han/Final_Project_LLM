import { type ChatMessage, type ChatResponse, type ToolCall } from '@server/agent/model/agent.schema';
import {
	type ClusterRow,
	type Collector,
	type CoverageGap,
	type Flow,
	type NodeCard,
	type NodeRow,
	type RemovalImpact,
	type Role,
	type TopRow,
} from '@server/graph/model/graph.schema';
import { type Ctx } from '@server/kernel/ctx';
import 'server-only';
import { type CurrentTime, executeTool } from './tools';

/**
 * The scripted agent: the demo without a network, a key or a credit balance.
 *
 * Two things depend on this. Dead venue wifi becomes an inconvenience rather than the end of the
 * presentation — and a reviewer can run the whole main scenario without being handed anybody's
 * API key, which is a condition of the technical check (§5.6.6) rather than a convenience.
 *
 * It calls the real tools through the real dispatcher, so the rows in the activity panel are
 * genuine, and rule 1 binds it exactly as it binds a model: every number, role and gid in a reply
 * is read out of a tool result from this turn. Nothing here knows a fact about the graph.
 *
 * It is keyed on intent, crudely, by word stems — the three demo questions first («кого первым»,
 * «кто собирает», «что если убрать»), then the rest of the tools. A question it does not recognise
 * gets the three demo questions back, never the top list dressed up as an answer.
 */

const ROLE_RU: Record<Role, string> = {
	consolidator: 'консолидатор',
	coordinator: 'координатор',
	distributor: 'распределитель',
	peripheral: 'периферия',
	terminal: 'конечный получатель',
	transit: 'транзит',
};

const FOOTER =
	'Это гипотезы для проверки, а не выводы о виновности. Сценарный режим: модель не подключена, ответ собран из результатов инструментов.';

/** How many sources «этих пятерых» and «топ-5» mean when the question names none. */
const DEFAULT_SOURCES = 5;

/** A gid is 15–20 digits not glued to other digits — the same shape the interface makes clickable. */
const GID_PATTERN = /(?<!\d)\d{15,20}(?!\d)/gu;

interface Refusal {
	reason: string;
	refused: true;
}

function gidsIn(text: string): string[] {
	return [...new Set(text.match(GID_PATTERN) ?? [])];
}

/** `ru-RU` groups with a no-break space: «1 877», the same as the amounts. */
function grouped(value: number): string {
	return Math.round(value).toLocaleString('ru-RU');
}

function kzt(value: number): string {
	return `${grouped(value)} KZT`;
}

/** «топ-10», «топ 3»: how many the question means. Anything else is the demo's five. */
function topCount(question: string): number {
	const asked = /топ[\s-]*(\d{1,2})(?!\d)/u.exec(question)?.[1];

	return asked === undefined ? DEFAULT_SOURCES : Math.min(20, Math.max(1, Number(asked)));
}

/** Stems, so «распределителей», «распределители» and «распределитель» all match. */
const ROLE_STEMS: readonly [RegExp, Role][] = [
	[/распредел/u, 'distributor'],
	[/консолид/u, 'consolidator'],
	[/транзит/u, 'transit'],
	[/координ/u, 'coordinator'],
	[/конечн|терминал/u, 'terminal'],
];

function roleIn(question: string): Role | undefined {
	return ROLE_STEMS.find(([stem]) => stem.test(question))?.[1];
}

/** Words that ask for a ranking — on their own too common («проверь погоду») to mean the top list. */
const TOP_INTENT = /перв|приорит|топ|важн|провер|подозр|top|first/u;

/**
 * The second half of the top-list intent: something that points at the graph. «топ» counts only
 * with a number («топ-10»), so «топ новостей» stays unrecognised. Short stems are anchored at a
 * word start (`\b` does not see Cyrillic), so «посетить» and «контроль» are not «сеть» and «роль».
 */
const GRAPH_CUE =
	/узел|узл|клиент|gid|приорит|перв|подозр|(?<![а-яё])(?:кого|сет[иья]|рол[иьея])|(?:топ|top)[\s-]*\d|first/u;

const NOT_UNDERSTOOD =
	'Сценарный режим, модель не подключена: этот вопрос я не распознал. Попробуйте один из демо-вопросов:\n' +
	'- «Кого проверять первым и почему?»\n' +
	'- «Кто собирает деньги с этих пятерых?»\n' +
	'- «Что будет, если убрать топ-5?»\n' +
	'Или назовите gid, номер кластера, «поток от <gid>» или «чего не хватает в данных».';

/** Evidence is a clause; the reply runs on after it, so it needs a full stop. */
function sentence(text: string): string {
	return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function isRefusal(result: unknown): result is Refusal {
	return typeof result === 'object' && result !== null && (result as { refused?: unknown }).refused === true;
}

/** One turn's calls, in order, so the panel shows them as they ran. */
class Turn {
	readonly calls: ToolCall[] = [];

	constructor(private readonly ctx: Ctx) {}

	call(name: string, args: Record<string, unknown>): ToolCall {
		const executed = executeTool(this.ctx, { args, name });

		this.calls.push(executed);

		return executed;
	}

	/** The honest reply when a tool failed or refused. `null` when the call succeeded. */
	problem(call: ToolCall): ChatResponse | null {
		if (call.status === 'error') return this.reply(`Инструмент «${call.label}» не сработал: ${String(call.result)}`);
		if (isRefusal(call.result)) return this.reply(`Инструмент «${call.label}» отказал: ${call.result.reason}`);

		return null;
	}

	reply(text: string): ChatResponse {
		return { reply: text, toolCalls: this.calls };
	}
}

function lastUserText(messages: readonly ChatMessage[]): string {
	return messages.findLast((message) => message.role === 'user')?.content ?? '';
}

/**
 * «Этих пятерых»: the gids the question names; failing that, the ones the previous answer named;
 * failing that, the top of the priority list — fetched through the tool, so it shows in the panel.
 */
function sources(turn: Turn, messages: readonly ChatMessage[]): ChatResponse | string[] {
	const text = lastUserText(messages).toLowerCase();
	const named = gidsIn(text);

	if (named.length >= 2) return named.slice(0, 20);

	// «с топ-5 распределителей»: the question names a role, so the sources are that role's top.
	const role = roleIn(text);

	if (role !== undefined) {
		const top = turn.call('get_top_nodes', { limit: topCount(text), role });

		return turn.problem(top) ?? (top.result as { rows: TopRow[] }).rows.map((row) => row.gid);
	}

	const earlier = messages
		.slice(0, -1)
		.toReversed()
		.map((message) => gidsIn(message.content))
		.find((gids) => gids.length >= 2);

	if (earlier !== undefined) return earlier.slice(0, DEFAULT_SOURCES);

	const top = turn.call('get_top_nodes', { limit: DEFAULT_SOURCES });

	return turn.problem(top) ?? (top.result as { rows: TopRow[] }).rows.map((row) => row.gid);
}

function describeNode(node: NodeRow): string {
	const truncated = node.truncated ? ' Обход остановлен на 4-м колене: куда деньги ушли дальше, в данных нет.' : '';
	const seed = node.isSeed ? ' Это seed: его входящие переводы в выгрузку не попали.' : '';

	return (
		`${node.gid} — ${ROLE_RU[node.role]} (уверенность ${node.roleScore.toFixed(2)}): ${sentence(node.evidence)} ` +
		`Входящих ${node.inDeg} на ${kzt(node.inKzt)}, исходящих ${node.outDeg} на ${kzt(node.outKzt)}; ` +
		`достижим из ${node.seedsUpstream} seed.${truncated}${seed}`
	);
}

function topTurn(turn: Turn, limit: number): ChatResponse {
	const top = turn.call('get_top_nodes', { limit });
	const failed = turn.problem(top);

	if (failed !== null) return failed;

	const { rows } = top.result as { rows: TopRow[] };
	const first = rows[0];

	if (first === undefined) return turn.reply('Список приоритетов пуст: в анализе нет ни одного узла.');

	const card = turn.call('get_node', { gid: first.gid });
	const lines = rows.map(
		(row) => `${row.rank}. ${row.gid} — ${ROLE_RU[row.role]}, приоритет ${row.priorityScore.toFixed(2)}: ${row.why}`,
	);
	const detail = turn.problem(card) === null ? `\n\nПервый: ${describeNode((card.result as NodeCard).node)}` : '';

	return turn.reply(
		`Кого проверять первым — ${rows.length} узлов с наивысшим приоритетом:\n${lines.join('\n')}${detail}\n\n${FOOTER}`,
	);
}

function collectorsTurn(turn: Turn, messages: readonly ChatMessage[]): ChatResponse {
	const from = sources(turn, messages);

	if (!Array.isArray(from)) return from;

	const found = turn.call('find_collectors', { gids: from });
	const failed = turn.problem(found);

	if (failed !== null) return failed;

	const { collectors, maxHops, total } = found.result as { collectors: Collector[]; maxHops: number; total: number };

	if (total === 0) {
		return turn.reply(
			`У ${from.length} узлов (${from.join(', ')}) нет общих получателей в пределах ${maxHops} переводов: ` +
				`признаков сбора денег с них в одном месте не видно.\n\n${FOOTER}`,
		);
	}

	const lines = collectors
		.slice(0, DEFAULT_SOURCES)
		.map(
			(collector) =>
				`- ${collector.gid} — ${ROLE_RU[collector.role]}: деньги приходят от ${collector.reachedFrom} из ${from.length}, ` +
				kzt(collector.kztFromSources),
		);

	return turn.reply(
		`Кто собирает деньги с ${from.length} узлов (${from.join(', ')}): в пределах ${maxHops} переводов ` +
			`общих получателей — ${grouped(total)}. Где сходятся деньги нескольких источников, стоит проверить:\n` +
			`${lines.join('\n')}\n\n${FOOTER}`,
	);
}

function removalTurn(turn: Turn, messages: readonly ChatMessage[]): ChatResponse {
	const text = lastUserText(messages);
	const named = gidsIn(text);
	let removed: string[];

	if (named.length > 0) {
		removed = named.slice(0, 20);
	} else {
		const top = turn.call('get_top_nodes', { limit: topCount(text.toLowerCase()) });
		const failed = turn.problem(top);

		if (failed !== null) return failed;
		removed = (top.result as { rows: TopRow[] }).rows.map((row) => row.gid);
	}

	const impact = turn.call('simulate_removal', { gids: removed });
	const failed = turn.problem(impact);

	if (failed !== null) return failed;

	const { after, before } = impact.result as RemovalImpact;
	const cut = before.seedsInLargest - after.seedsInLargest;
	const core =
		cut > 0
			? `От крупнейшей компоненты отрезано ${grouped(cut)} seed.`
			: 'Seed в крупнейшей компоненте не отделились: ядро сети держится и без этих узлов.';

	return turn.reply(
		`Если убрать ${removed.length} узлов (${removed.join(', ')}) — данные не меняются, это расчёт:\n` +
			`- компонент связности: ${grouped(before.components)} → ${grouped(after.components)};\n` +
			`- крупнейшая компонента: ${grouped(before.largest)} → ${grouped(after.largest)} узлов;\n` +
			`- seed в крупнейшей компоненте: ${grouped(before.seedsInLargest)} → ${grouped(after.seedsInLargest)}.\n` +
			`${core}\n\n${FOOTER}`,
	);
}

function gapsTurn(turn: Turn): ChatResponse {
	const gaps = turn.call('coverage_gaps', {});
	const failed = turn.problem(gaps);

	if (failed !== null) return failed;

	const list = (gaps.result as { gaps: CoverageGap[] }).gaps;

	if (list.length === 0) return turn.reply('Инструмент не нашёл пробелов в данных.');

	const lines = list.map((gap) => `- ${gap.gap} (узлов: ${gap.affectedNodes}). Запросить: ${gap.nextRequest}`);

	return turn.reply(`Чего данные не показывают:\n${lines.join('\n')}`);
}

function clusterTurn(turn: Turn, clusterId: number): ChatResponse {
	const found = turn.call('get_cluster', { clusterId });
	const failed = turn.problem(found);

	if (failed !== null) return failed;

	const { cluster, roleCounts, topMembers } = found.result as {
		cluster: ClusterRow;
		roleCounts: Record<Role, number>;
		topMembers: { gid: string; role: Role }[];
	};
	const mix = Object.entries(roleCounts)
		.filter(([, count]) => count > 0)
		.map(([role, count]) => `${ROLE_RU[role as Role]} ${count}`)
		.join(', ');
	const members = topMembers.slice(0, DEFAULT_SOURCES).map((member) => `- ${member.gid} — ${ROLE_RU[member.role]}`);

	return turn.reply(
		`Кластер ${cluster.clusterId}: ${cluster.nNodes} узлов, из них seed ${cluster.nSeed}, ` +
			`внутренний оборот ${kzt(cluster.sumKztInternal)}. Роли: ${mix}.\n` +
			`Гипотеза: ${cluster.hypothesis}\nГлавные по приоритету:\n${members.join('\n')}\n\n${FOOTER}`,
	);
}

function flowTurn(turn: Turn, input: { direction: 'down' | 'up'; gid: string }): ChatResponse {
	const traced = turn.call('trace_flow', input);
	const failed = turn.problem(traced);

	if (failed !== null) return failed;

	const flow = traced.result as Flow & { totalEdges: number; totalKzt: number; totalNodes: number };
	const where = input.direction === 'down' ? 'куда уходят деньги от' : 'откуда приходят деньги к';
	const lines = flow.edges
		.slice(0, DEFAULT_SOURCES)
		.map((edge) => `- ${edge.src} → ${edge.dst}: ${kzt(edge.sumKzt)}, переводов ${edge.nTx}`);

	return turn.reply(
		`Поток — ${where} ${input.gid}, до ${flow.maxHops} переводов: ${flow.totalNodes} узлов, ${flow.totalEdges} связей, ` +
			`${kzt(flow.totalKzt)}. Крупнейшие связи:\n${lines.join('\n')}\n\n${FOOTER}`,
	);
}

function nodeTurn(turn: Turn, gid: string): ChatResponse {
	const card = turn.call('get_node', { gid });
	const failed = turn.problem(card);

	if (failed !== null) return failed;

	const { node, topIn, topOut } = card.result as NodeCard;
	const peers = (label: string, list: NodeCard['topIn']) =>
		list.length === 0
			? ''
			: `\n${label}: ${list
					.slice(0, 3)
					.map((peer) => `${peer.gid} (${kzt(peer.sumKzt)})`)
					.join(', ')}`;

	return turn.reply(
		`${describeNode(node)}${peers('Крупнейшие отправители', topIn)}${peers('Крупнейшие получатели', topOut)}\n\n${FOOTER}`,
	);
}

function clockTurn(turn: Turn): ChatResponse {
	const call = turn.call('get_current_time', {});
	const failed = turn.problem(call);

	if (failed !== null) return failed;

	const time = call.result as CurrentTime;

	return turn.reply(`Сценарный режим, модель не подключена. Часы сервера: ${time.local} (${time.timeZone}).`);
}

export function runMock(ctx: Ctx, input: { messages: readonly ChatMessage[] }): ChatResponse {
	const turn = new Turn(ctx);
	const text = lastUserText(input.messages);
	const question = text.toLowerCase();
	const named = gidsIn(text);
	const clusterId = /кластер\D{0,4}(\d{1,4})(?!\d)/u.exec(question)?.[1];

	if (/собира|collect/u.test(question)) return collectorsTurn(turn, input.messages);
	if (/убра|удал|заблок|remove/u.test(question)) return removalTurn(turn, input.messages);
	if (/пробел|не хват|не показ|не видно|gap/u.test(question)) return gapsTurn(turn);
	if (clusterId !== undefined) return clusterTurn(turn, Number(clusterId));

	const first = named[0];

	if (first !== undefined && /поток|куда|откуда|flow/u.test(question)) {
		return flowTurn(turn, { direction: /откуда|кто плат|from/u.test(question) ? 'up' : 'down', gid: first });
	}

	if (first !== undefined) return nodeTurn(turn, first);
	if (/врем|time|который час/u.test(question)) return clockTurn(turn);
	if (TOP_INTENT.test(question) && GRAPH_CUE.test(question)) return topTurn(turn, topCount(question));

	// Not a guess: an unrelated question answered with the top list reads as the product ignoring
	// what was asked. No tool is called, so the panel stays empty — which is the truth.
	return turn.reply(NOT_UNDERSTOOD);
}
