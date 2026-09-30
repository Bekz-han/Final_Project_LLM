import { type Role } from '@server/graph/model/graph.schema';

/**
 * The words the screen uses for each role, and the order the legend lists them in.
 *
 * The order is by how much an analyst cares: where money collects and who organises it first,
 * the long tail of the graph last. It is not the schema's order, which is the ТЗ's.
 */
export const ROLE_ORDER: readonly Role[] = [
	'consolidator',
	'coordinator',
	'distributor',
	'transit',
	'terminal',
	'peripheral',
];

export const ROLE_LABELS: Record<Role, string> = {
	consolidator: 'Консолидатор',
	coordinator: 'Координатор',
	distributor: 'Распределитель',
	peripheral: 'Периферийный',
	terminal: 'Конечный получатель',
	transit: 'Транзитёр',
};

/** One line under the legend entry, so a colour is never the only thing that says what it means. */
export const ROLE_HINTS: Record<Role, string> = {
	consolidator: 'собирает деньги со многих',
	coordinator: 'у истоков, рассылает дальше',
	distributor: 'раздаёт многим',
	peripheral: 'слабо связан',
	terminal: 'деньги оседают',
	transit: 'пропускает через себя',
};

/**
 * Literal class names, because Tailwind finds utilities by reading the source: a class built as
 * `bg-role-${role}` would never be emitted.
 */
export const ROLE_CHIP_CLASS: Record<Role, string> = {
	consolidator: 'bg-role-consolidator',
	coordinator: 'bg-role-coordinator',
	distributor: 'bg-role-distributor',
	peripheral: 'bg-role-peripheral',
	terminal: 'bg-role-terminal',
	transit: 'bg-role-transit',
};

export interface FlagMeta {
	label: string;
	tone: 'accent' | 'danger' | 'info' | 'neutral' | 'warning';
}

const FLAGS: Record<string, FlagMeta> = {
	burst: { label: 'всплеск активности', tone: 'warning' },
	cycle: { label: 'возвратный поток (цикл)', tone: 'warning' },
	depth_outlier: { label: 'аномальный профиль для колена', tone: 'warning' },
	fast_transit: { label: 'быстрый транзит', tone: 'info' },
	mixed_signals: { label: 'смешанные признаки', tone: 'neutral' },
	repeat_route: { label: 'повторяющийся маршрут', tone: 'warning' },
	seed: { label: 'seed — исходный клиент', tone: 'danger' },
	split: { label: 'дробление сумм', tone: 'warning' },
	sync_inflow: { label: 'синхронный приход', tone: 'info' },
	truncated: { label: 'обход обрезан на 4-м колене', tone: 'warning' },
};

/** A flag the screen has no words for is still shown, as itself, rather than dropped. */
export function flagMeta(flag: string): FlagMeta {
	return FLAGS[flag] ?? { label: flag, tone: 'neutral' };
}

/** Eight cluster colours, cycled. The palette carries no meaning beyond "these belong together". */
export const CLUSTER_PALETTE_SIZE = 8;

export function clusterSlot(clusterId: number): number {
	return (clusterId % CLUSTER_PALETTE_SIZE) + 1;
}

/** The role colour as a CSS value, for SVG strokes that a utility class cannot reach. */
export function roleColor(role: Role): string {
	return `var(--color-role-${role})`;
}

/** How many nodes carry each role, in legend order. */
export function countRoles(nodes: readonly { role: Role }[]): Map<Role, number> {
	const counts = new Map<Role, number>(ROLE_ORDER.map((role) => [role, 0]));

	for (const node of nodes) counts.set(node.role, (counts.get(node.role) ?? 0) + 1);

	return counts;
}
