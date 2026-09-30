import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * No screen builds its own form control.
 *
 * This is the check that makes `docs/ui-patterns.md` §5 true rather than aspirational. The
 * document exists because screens get built one at a time and each invents its own answers: the
 * class string for a `<select>` written out four times with three different heights, a numeric
 * field that was a bare `<input>` and accepted letters, a picker made of buttons that announced
 * "pressed" instead of "one of three".
 *
 * Every one of those passes review. None of them passes this.
 *
 * The rule is deliberately absolute — no raw `<input>`, `<select>` or `<textarea>` in the screen
 * layers — because "unless you have a good reason" is how the first exception gets in, and the
 * first exception is what the next screen copies. A control that genuinely does not exist yet is
 * added to `src/shared/ui/` and to the document's inventory, which takes ten minutes and leaves
 * the next screen better rather than worse.
 *
 * `src/shared/ui` itself is exempt, and has to be: it is where the raw elements legitimately live.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The layers that hold screens. `views` is the FSD "pages" layer; `app` holds the routes. */
const SCREEN_LAYERS = ['views', 'widgets', 'features', 'app'];

/** `<input`, `<select`, `<textarea` as an opening tag: followed by whitespace, `/` or `>`. */
const RAW_CONTROL = /<(input|select|textarea)[\s/>]/gu;

function screens(): string[] {
	return SCREEN_LAYERS.filter((layer) => existsSync(join(SRC, layer))).flatMap((layer) =>
		readdirSync(join(SRC, layer), { recursive: true })
			.map((entry) => `${layer}/${String(entry).split(sep).join('/')}`)
			.filter((path) => path.endsWith('.tsx')),
	);
}

/**
 * Comments are stripped first.
 *
 * A file may explain in prose why a `<select>` must not fire on change, and a check that reads a
 * warning as a violation is a check nobody can keep green honestly.
 */
function code(path: string): string {
	return readFileSync(join(SRC, path), 'utf8')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/\/\/[^\n]*/gu, '');
}

const files = screens();

describe('screen layers', () => {
	it('finds screens to check, so an empty sweep cannot pass', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it('builds every form control from src/shared/ui', () => {
		const offenders = files
			.map((path) => ({ found: [...code(path).matchAll(RAW_CONTROL)].map((match) => match[1]), path }))
			.filter((file) => file.found.length > 0)
			.map((file) => `${file.path}: <${[...new Set(file.found)].join('>, <')}>`);

		expect(offenders).toEqual([]);
	});
});
