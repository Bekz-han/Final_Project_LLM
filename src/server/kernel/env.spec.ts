import { parseEnv } from '@server/kernel/env';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const VALID = { LLM_API_KEY: 'test-key' };

describe('parseEnv', () => {
	it('defaults NODE_ENV to development', () => {
		expect(parseEnv(VALID).NODE_ENV).toBe('development');
	});

	it('keeps an explicit NODE_ENV', () => {
		expect(parseEnv({ ...VALID, NODE_ENV: 'test' }).NODE_ENV).toBe('test');
	});

	it('rejects an unknown NODE_ENV instead of silently treating it as production', () => {
		expect(() => parseEnv({ ...VALID, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
	});

	it('points at .env.example, because that is the next thing to look at', () => {
		expect(() => parseEnv({})).toThrow(/\.env\.example/);
	});

	/**
	 * The starter runs with no database on purpose: every service a reviewer has to stand up
	 * before the product runs is another way for the review to end early.
	 */
	it('boots with no database at all', () => {
		expect(parseEnv(VALID).DATABASE_URL).toBeUndefined();
	});

	it('still rejects a connection string for the wrong kind of database', () => {
		expect(() => parseEnv({ ...VALID, DATABASE_URL: 'mysql://user:pass@localhost/db' })).toThrow(/PostgreSQL/);
	});

	it('accepts a PostgreSQL connection string when there is one', () => {
		const url = 'postgresql://app_user:app_user@localhost:5433/app';

		expect(parseEnv({ ...VALID, DATABASE_URL: url }).DATABASE_URL).toBe(url);
	});

	it('requires a key, because a missing one fails on stage instead of at boot', () => {
		expect(() => parseEnv({})).toThrow(/LLM_API_KEY/);
	});

	it('allows no key when the scripted agent is selected', () => {
		expect(parseEnv({ LLM_PROVIDER: 'mock' }).LLM_PROVIDER).toBe('mock');
	});

	it('defaults to the Responses adapter', () => {
		expect(parseEnv(VALID).LLM_PROVIDER).toBe('responses');
	});

	it('rejects an adapter that does not exist, rather than falling back silently', () => {
		expect(() => parseEnv({ ...VALID, LLM_PROVIDER: 'anthropic' })).toThrow(/LLM_PROVIDER/);
	});

	it('reads the web-search switch as a boolean, not as the string "false"', () => {
		expect(parseEnv(VALID).OPENAI_WEB_SEARCH).toBe(false);
		expect(parseEnv({ ...VALID, OPENAI_WEB_SEARCH: 'true' }).OPENAI_WEB_SEARCH).toBe(true);
	});
});

/**
 * The file a reviewer is told to copy, parsed exactly as they would get it.
 *
 * `cp .env.example .env && pnpm dev` is step one of the README and step one of §5.4.16's
 * elimination test, and it used to fail: an example file states its optional knobs as `FOO=`,
 * which reaches `process.env` as an empty string rather than as absent, so every `.min(1)` and
 * `.url()` on an optional variable rejected it and the application refused to boot.
 *
 * Reading the real file rather than a copy of its contents is the point. A fixture would have
 * gone on passing while the shipped file rotted.
 */
describe('.env.example, as a reviewer receives it', () => {
	const EXAMPLE = parse(readFileSync(join(process.cwd(), '.env.example'), 'utf8'));

	it('is found, so an empty sweep cannot pass', () => {
		expect(Object.keys(EXAMPLE).length).toBeGreaterThan(5);
	});

	it('boots as shipped, with nothing edited and no credentials', () => {
		expect(() => parseEnv(EXAMPLE)).not.toThrow();
	});

	it('ships the no-credentials provider, so copying it gives a running product', () => {
		expect(parseEnv(EXAMPLE).LLM_PROVIDER).toBe('mock');
	});

	it('still asks for a key when a real provider is selected', () => {
		expect(() => parseEnv({ ...EXAMPLE, LLM_PROVIDER: 'responses' })).toThrow(/LLM_API_KEY/);
	});
});

describe('a blank value means unset, not empty', () => {
	const VALID_BLANKS = { LLM_API_KEY: 'k' };

	it.each(['DATABASE_URL', 'LLM_BASE_URL', 'LLM_MODEL', 'OPENAI_VECTOR_STORE_ID', 'OPENAI_WEB_SEARCH'])(
		'accepts a blank %s',
		(name) => {
			expect(() => parseEnv({ ...VALID_BLANKS, [name]: '' })).not.toThrow();
		},
	);

	it('falls back to the default when the value is blank rather than absent', () => {
		expect(parseEnv({ ...VALID_BLANKS, LLM_MODEL: '' }).LLM_MODEL).toBe('gpt-5');
	});

	it('treats a blank key as no key at all', () => {
		expect(() => parseEnv({ LLM_API_KEY: '', LLM_PROVIDER: 'responses' })).toThrow(/LLM_API_KEY/);
	});
});
