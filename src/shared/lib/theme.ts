export type Theme = 'dark' | 'light' | 'system';

export const THEME_STORAGE_KEY = 'theme';

/**
 * Runs before first paint in the document head, so an explicitly chosen theme is applied
 * before React hydrates and the page never flashes the wrong palette. It must stay inline
 * and synchronous — a deferred module would run after the first frame.
 *
 * No stored choice means the product default, dark: the money graph reads best on a dark ground.
 * «Системная» is still offered and, once chosen, is stored as 'system' and respected.
 */
export const DEFAULT_THEME: Theme = 'dark';

export const THEME_INIT_SCRIPT = `
try {
	var t = localStorage.getItem('${THEME_STORAGE_KEY}');
	if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
	else if (t !== 'system') document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
} catch (e) {
	document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
}
`;
