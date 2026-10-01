import { type ChatMessage } from '@server/agent/model/agent.schema';
import 'server-only';

/**
 * Personal data is replaced before anything else sees the text: the model provider, the trace in
 * Langfuse, the stored conversation. Once a value reaches a trace or a backup it cannot be taken
 * back out, so masking is the first step of a turn and not a filter on the way to the log.
 *
 * What counts, and how it is told apart from the numbers this product lives on:
 *
 * | kind  | shape                                    | why it is not a gid or an amount         |
 * | ----- | ---------------------------------------- | ---------------------------------------- |
 * | iin   | 12 digits, valid ИИН/БИН check digit, or | a gid is 18 digits; the check digit      |
 * |       | any 12 digits right after «ИИН»/«БИН»     | and the YYMM month keep amounts out       |
 * | card  | 16 digits, whole or in fours, Luhn-valid | 16 ≠ 18, and Luhn again rules out amounts |
 * | iban  | KZ + 18 letters and digits               | starts with letters                      |
 * | phone | +7 or 8, then 10 digits with separators  | 11 digits                                |
 * | email | name@domain.tld                          | —                                        |
 *
 * Every digit pattern refuses to start or end inside a longer run of digits, so the middle of an
 * 18-digit gid never matches anything. Only the kind and the count leave this module — the trace
 * records `{ iin: 1 }`, never the value.
 */
export type PiiKind = 'card' | 'email' | 'iban' | 'iin' | 'phone';

export type PiiCounts = Partial<Record<PiiKind, number>>;

export const PII_MASK: Record<PiiKind, string> = {
	card: '[номер карты скрыт]',
	email: '[email скрыт]',
	iban: '[IBAN скрыт]',
	iin: '[ИИН скрыт]',
	phone: '[телефон скрыт]',
};

const IIN_WEIGHTS_FIRST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const IIN_WEIGHTS_SECOND = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

function weightedMod11(digits: readonly number[], weights: readonly number[]): number {
	let sum = 0;

	for (const [index, weight] of weights.entries()) sum += weight * (digits[index] ?? 0);

	return sum % 11;
}

/** The value is already known to be ASCII digits, so one character is one digit. */
function digitsOf(value: string): number[] {
	return Array.from(value, (char) => Number(char));
}

/**
 * An ИИН or a БИН: it starts with a year and a month (YYMM — a birth date for a person, the
 * registration for a company), and its last digit is the control digit: weights 1…11, and if that
 * gives 10, weights 3…11,1,2.
 *
 * The control digit alone is not enough here. A round amount — 150000000000 — has a weighted sum
 * of 11 and a last digit of 0, so it passes; its month «00» is what rules it out.
 */
export function isValidIin(value: string): boolean {
	if (!/^\d{12}$/u.test(value)) return false;

	const month = Number(value.slice(2, 4));

	if (month < 1 || month > 12) return false;

	const digits = digitsOf(value);
	let control = weightedMod11(digits, IIN_WEIGHTS_FIRST);

	if (control === 10) control = weightedMod11(digits, IIN_WEIGHTS_SECOND);

	return control !== 10 && control === digits[11];
}

export function isValidLuhn(value: string): boolean {
	let sum = 0;

	// From the right: every second digit is doubled, and a two-digit result counts as its digit sum.
	for (const [index, digit] of digitsOf(value).reverse().entries()) {
		const doubled = index % 2 === 0 ? digit : digit * 2;

		sum += doubled > 9 ? doubled - 9 : doubled;
	}

	return sum % 10 === 0;
}

interface Rule {
	accept?: (match: string, labelled: boolean) => boolean;
	kind: PiiKind;
	pattern: RegExp;
}

/** Order matters: the card and the IBAN go first so their digits are gone before the ИИН looks. */
const RULES: readonly Rule[] = [
	{ kind: 'email', pattern: /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.\p{L}{2,}/gu },
	{ kind: 'iban', pattern: /\bKZ\d{2}(?:\s?[A-Z\d]){16}\b/giu },
	{
		accept: (match) => isValidLuhn(match.replace(/\D/gu, '')),
		kind: 'card',
		pattern: /(?<!\d)(?:\d{4}[ -]){3}\d{4}(?!\d)|(?<!\d)\d{16}(?!\d)/gu,
	},
	{ kind: 'phone', pattern: /(?<![\d+])(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/gu },
	{
		accept: (match, labelled) => labelled || isValidIin(match),
		kind: 'iin',
		pattern: /(?<!\d)\d{12}(?!\d)/gu,
	},
];

/** «ИИН 950101300123», «мой БИН: …», «IIN - …» — a label right before the digits. */
const IIN_LABEL = /(?:ИИН|БИН|IIN|BIN)\s*[:№#-]?\s*$/iu;

export interface MaskResult {
	found: PiiCounts;
	text: string;
}

export function maskPii(text: string): MaskResult {
	const found: PiiCounts = {};
	let masked = text;

	for (const rule of RULES) {
		masked = masked.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
			const offset = rest.at(-2) as number;
			const whole = rest.at(-1) as string;
			const labelled = IIN_LABEL.test(whole.slice(Math.max(0, offset - 12), offset));

			if (rule.accept !== undefined && !rule.accept(match, labelled)) return match;

			found[rule.kind] = (found[rule.kind] ?? 0) + 1;

			return PII_MASK[rule.kind];
		});
	}

	return { found, text: masked };
}

export function mergeCounts(into: PiiCounts, from: PiiCounts): PiiCounts {
	for (const [kind, count] of Object.entries(from) as [PiiKind, number][]) {
		into[kind] = (into[kind] ?? 0) + count;
	}

	return into;
}

/**
 * Masks every message of the conversation, not only the last: the browser sends the history back
 * on each turn, and an ИИН typed three turns ago is still in it.
 */
export function maskMessages(messages: readonly ChatMessage[]): { found: PiiCounts; messages: ChatMessage[] } {
	const found: PiiCounts = {};
	const masked = messages.map((message) => {
		const result = maskPii(message.content);

		mergeCounts(found, result.found);

		return { ...message, content: result.text };
	});

	return { found, messages: masked };
}
