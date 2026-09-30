/**
 * Everything that is not a digit, removed.
 *
 * Its own file because `NumberInput` may export components and nothing else — Fast Refresh
 * reloads a module differently when it holds both — and because the rule is worth testing
 * without rendering anything.
 */
export function digitsOf(value: string): string {
	return value.replaceAll(/[^0-9]/gu, '');
}

/**
 * Where the caret belongs after the value has been cleaned.
 *
 * Rewriting `event.target.value` moves the caret to the end, so typing a letter in the middle of
 * "1234" threw the caret past the last digit and the next keystroke landed in the wrong place.
 * The sanitised value is all digits, so the caret index is simply how many digits survived in
 * front of it.
 */
export function caretAfterCleaning(rawValue: string, caret: number): number {
	return digitsOf(rawValue.slice(0, caret)).length;
}
