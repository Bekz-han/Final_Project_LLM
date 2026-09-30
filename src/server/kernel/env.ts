import 'server-only';
import { z } from 'zod';

/**
 * A blank line in a `.env` file means "not set", but it does not arrive that way.
 *
 * `FOO=` puts an empty string into `process.env`, which is *defined*, so `.optional()` never
 * applies and `.min(1)` or `.url()` rejects it. `.env.example` is full of deliberately blank
 * values — that is how an example file shows which knobs exist — so copying it and starting the
 * application failed validation at boot, naming a variable the reader had never heard of and does
 * not need. Treating a blank as absent is what the author meant and what every other tool does.
 */
const blank = (value: unknown) => (value === '' ? undefined : value);

/**
 * Environment validation, run once at boot by `src/instrumentation.ts`.
 *
 * The point is the timing. An unset variable discovered at boot is a stack trace on startup
 * naming it; the same mistake discovered lazily is a failed request three layers down, in front
 * of a judge, blamed on the model.
 *
 * This lives in `src/server/kernel` rather than `src/shared/config`. `shared` is reachable from a
 * client component, and a module holding an API key must not be. Next.js would not actually ship
 * the secret — a non-`NEXT_PUBLIC_` variable is `undefined` in a browser bundle — but it would
 * fail as a confusing validation error at render time instead of as a build error naming the real
 * problem. `import 'server-only'` names it.
 *
 * Add variables here as the product grows: one schema, one failure message, one place that
 * decides what a valid environment is.
 */
const envSchema = z
	.object({
		/**
		 * Optional, and absent by default.
		 *
		 * The starter boots, runs and demonstrates itself with no database at all — state lives in
		 * JSON and in memory. That is deliberate: every service a reviewer has to stand up before
		 * the product runs is another way for the review to end early. Set this only once
		 * something genuinely needs to survive a restart, then `pnpm db:up && pnpm db:migrate`.
		 */
		DATABASE_URL: z.preprocess(
			blank,
			z
				.string()
				.min(1)
				.refine(
					(value) => /^postgres(ql)?:\/\//.test(value),
					'must be a PostgreSQL connection string, for example postgresql://app_user:app_user@localhost:5433/app',
				)
				.optional(),
		),

		LLM_API_KEY: z.preprocess(blank, z.string().min(1).optional()),

		/** Any Chat Completions compatible endpoint. Empty means OpenAI's own. */
		LLM_BASE_URL: z.preprocess(blank, z.url().optional()),

		LLM_MODEL: z.preprocess(blank, z.string().min(1).default('gpt-5')),

		/**
		 * Which way the agent talks to a model.
		 *
		 * `responses` — OpenAI's Responses API. The default, and the only one with hosted tools
		 *   (`web_search`, `file_search`), so it is the one that can search the web or a set of
		 *   uploaded documents without any retrieval code of our own.
		 * `chat`      — Chat Completions. The portable dialect: NVIDIA NIM, Groq, Together,
		 *   vLLM and OpenAI all speak it. This is the fallback when credits run out or the
		 *   sponsor's endpoint is saturated, and it is a `.env` edit away.
		 * `mock`      — a scripted agent that calls the real tools with no key and no network.
		 *   Keep it working: it is how the product is demonstrated on dead wifi, and how a
		 *   reviewer verifies the main scenario without being handed anybody's API key.
		 */
		LLM_PROVIDER: z.enum(['responses', 'chat', 'mock']).default('responses'),

		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

		/** Hosted vector store for `file_search`. Created by `pnpm tsx scripts/upload-files.ts`. */
		OPENAI_VECTOR_STORE_ID: z.preprocess(blank, z.string().min(1).optional()),

		/** Enables the hosted `web_search` tool. Responses adapter only. */
		OPENAI_WEB_SEARCH: z.preprocess(
			blank,
			z
				.enum(['true', 'false'])
				.default('false')
				.transform((value) => value === 'true'),
		),
	})
	.refine((env) => env.LLM_PROVIDER === 'mock' || Boolean(env.LLM_API_KEY), {
		error: 'LLM_API_KEY is required unless LLM_PROVIDER=mock',
		path: ['LLM_API_KEY'],
	});

export type Env = z.infer<typeof envSchema>;

/** Pure, so the rules can be tested without touching the real environment. */
export function parseEnv(source: Record<string, string | undefined>): Env {
	const result = envSchema.safeParse(source);

	if (!result.success) {
		const problems = result.error.issues
			.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
			.join('\n');

		throw new Error(`Environment is not valid:\n${problems}\n\nSee .env.example.`);
	}

	return result.data;
}

let cached: Env | null = null;

export function readEnv(): Env {
	cached ??= parseEnv(process.env);
	return cached;
}

/** Tests mutate `process.env`; without this they would all see the first value read. */
export function resetEnvCache(): void {
	cached = null;
}
