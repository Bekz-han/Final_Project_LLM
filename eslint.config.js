import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import checkFile from 'eslint-plugin-check-file';
import perfectionist from 'eslint-plugin-perfectionist';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import sortReactDependencyArrays from 'eslint-plugin-sort-react-dependency-arrays';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import path from 'path';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';

const compat = new FlatCompat({
	allConfig: js.configs.all,
	baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
	recommendedConfig: js.configs.recommended,
});

/**
 * Design-token enforcement (see docs/17-design-system.md).
 *
 * Written as `no-restricted-syntax` regex selectors rather than prose in CLAUDE.md so the rule
 * is unskippable and self-correcting: the fix arrives as a lint error at the call site.
 * Note esquery does not support \b, so boundaries are spelled as explicit character classes.
 */
const TAILWIND_PALETTE =
	'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITY_PREFIX =
	'bg|text|border|ring|ring-offset|outline|fill|stroke|divide|placeholder|caret|accent|decoration|shadow|from|via|to';
const PRIMITIVE_TOKEN = 'white|black|slate|gray|blue|red|green|amber|violet';

const BANNED_PALETTE = `(^|[^-a-zA-Z0-9])(${COLOR_UTILITY_PREFIX})-(${TAILWIND_PALETTE})(-[0-9]{2,3})?([^a-z]|$)`;
const BANNED_ARBITRARY_COLOR = `(${COLOR_UTILITY_PREFIX})-[[](#|rgb|hsl|var[(])`;
const BANNED_PRIMITIVE = `var[(]--(${PRIMITIVE_TOKEN})(-[0-9]{2,3})?[)]`;

/**
 * Only shadow-sm/md/lg (the ramp) and shadow-control are theme-aware — their hairline and control
 * colors are re-pointed in the [data-theme='dark'] block. Tailwind's own `shadow`, shadow-xs,
 * shadow-xl and shadow-2xl still resolve, but to un-themed built-in values, so they silently opt out
 * of the dark-mode swap. That is invisible in review, which is why this is a rule and not a doc line:
 * two bare `shadow` uses had already drifted into ProductCarousel unnoticed.
 *
 * Arbitrary shadow-[...] stays allowed. A divider, an inset groove and a focus ring are legitimately
 * not elevation and cannot be expressed as a ramp level.
 *
 * Boundaries are whitespace, a variant colon, or the string edge — deliberately NOT the "any
 * non-word char" the palette rules use. A class list is space-separated, so that is enough to match
 * one, while sparing strings where "shadow" is a word rather than a utility: the pipe-delimited
 * COLOR_UTILITY_PREFIX above, and the messages below. Both tripped the looser version.
 */
const BANNED_OFF_RAMP_SHADOW = '(^|[ \\n]|:)shadow(-xs|-xl|-2xl)?([ \\n]|$)';

const DESIGN_TOKEN_RESTRICTIONS = [
	{
		message:
			'Use a semantic color token, not the default Tailwind palette (see docs/17-design-system.md). ' +
			'Surfaces: bg-canvas/surface/surface-raised/surface-sunken/surface-hover. ' +
			'Text: text-fg/fg-muted/fg-subtle/on-accent. Accent: bg-accent, text-accent-fg. ' +
			'Status: success/warning/danger/info (+ -subtle). Borders: border-border/border-strong.',
		selector: `Literal[value=/${BANNED_PALETTE}/]`,
	},
	{
		message: 'Use a semantic color token, not the default Tailwind palette (see docs/17-design-system.md).',
		selector: `TemplateElement[value.raw=/${BANNED_PALETTE}/]`,
	},
	{
		message:
			'No arbitrary color values. Add a semantic token to @theme in src/app/globals.css and document it in docs/17-design-system.md. ' +
			'Runtime data-driven colors (an environment displayColor) belong in an inline style, not a class.',
		selector: `Literal[value=/${BANNED_ARBITRARY_COLOR}/]`,
	},
	{
		message:
			'Tier-1 primitives back the semantic tokens and must not appear in markup. Use the semantic token (or var(--color-*)) instead.',
		selector: `Literal[value=/${BANNED_PRIMITIVE}/]`,
	},
	{
		message:
			'Off the elevation ramp. Use shadow-sm (resting card), shadow-md (hover on a clickable card), ' +
			'shadow-lg (dialog, popover, tooltip, select) or shadow-control (slider thumb, toggle knob, ' +
			'small floating button). The Tailwind built-ins (bare, -xs, -xl, -2xl) resolve to un-themed ' +
			'values and ignore the dark-mode swap. See docs/17-design-system.md for placement rules.',
		selector: `Literal[value=/${BANNED_OFF_RAMP_SHADOW}/]`,
	},
	{
		message: 'Off the elevation ramp. Use shadow-sm/md/lg or shadow-control (see docs/17-design-system.md).',
		selector: `TemplateElement[value.raw=/${BANNED_OFF_RAMP_SHADOW}/]`,
	},
];

/**
 * Single-letter names allowed anywhere: the documented conventions (i/j/k loop indices, a/b sort
 * comparators, x/y coordinates, n counts) plus three this codebase uses pervasively and cannot
 * reasonably drop — `e` for DOM events, `s` for Zustand selectors, and `t` for the toast object
 * react-hot-toast hands to `toast.custom`. Everything else must be two characters or more.
 */
const ALLOWED_SHORT_NAME = '^(_|[abeijknstxy]|.{2,})$';

const BOOLEAN_PROP_RESTRICTIONS = [
	{
		message:
			'No boolean prop or option defaulting to true — omitting it must mean "off". Invert the name instead ' +
			'(subtleBorder = false, not strongBorder = true) so call sites stay explicit about opt-in behavior.',
		selector: ':function > ObjectPattern > Property > AssignmentPattern[right.raw="true"]',
	},
];

const REACT_NAMESPACE_RESTRICTIONS = [
	{
		message: 'Use named imports instead of React namespace (e.g. import { ReactNode } from "react")',
		selector: 'MemberExpression[object.name="React"]',
	},
	{
		message: 'Use named imports instead of React namespace (e.g. import type { ReactNode } from "react")',
		selector: 'TSQualifiedName[left.name="React"]',
	},
];

export default defineConfig([
	globalIgnores([
		// Build output and generated declarations. `dist` was the Vite output; Next writes to
		// `.next` and regenerates `next-env.d.ts` on every build, so linting either is noise.
		'.next/**',
		'next-env.d.ts',
		'coverage/**',
		'.cache/**',
		'src/server/db/generated/**',
	]),

	react.configs.flat.all,
	reactHooks.configs.flat['recommended-latest'],

	{ extends: compat.extends('airbnb') },

	tseslint.configs.eslintRecommended,
	tseslint.configs.strictTypeChecked,
	tseslint.configs.stylisticTypeChecked,

	react.configs.flat['jsx-runtime'],
	boundaries.configs.recommended,
	perfectionist.configs['recommended-natural'],
	prettierRecommended,

	{
		languageOptions: {
			ecmaVersion: 'latest',
			globals: {
				...globals.browser,
			},
			parser: tseslint.parser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
				project: './tsconfig.eslint.json',
			},
			sourceType: 'module',
		},
		plugins: {
			boundaries,
			'check-file': checkFile,
			'react-refresh': reactRefresh,
			'sort-react-dependency-arrays': sortReactDependencyArrays,
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': [2, { fixStyle: 'inline-type-imports' }],
			'@typescript-eslint/default-param-last': 2,
			'@typescript-eslint/max-params': [2, { max: 2 }],
			'@typescript-eslint/naming-convention': [
				2,
				{
					// `filter` exempts names starting with _, matching the ^_ escape hatch in no-unused-vars.
					custom: { match: true, regex: ALLOWED_SHORT_NAME },
					filter: { match: false, regex: '^_' },
					format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
					selector: 'variable',
				},
				{
					// PascalCase is allowed because components arrive as parameters (Story, Icon, Component).
					custom: { match: true, regex: ALLOWED_SHORT_NAME },
					filter: { match: false, regex: '^_' },
					format: ['camelCase', 'PascalCase'],
					selector: 'parameter',
				},
				{ format: ['camelCase', 'PascalCase'], selector: 'function' },
				{ format: ['PascalCase'], selector: 'typeLike' },
			],
			'@typescript-eslint/no-confusing-void-expression': 0,
			'@typescript-eslint/no-misused-promises': [2, { checksVoidReturn: { attributes: false } }],
			'@typescript-eslint/no-non-null-assertion': 0,
			'@typescript-eslint/no-shadow': 2,
			'@typescript-eslint/no-unsafe-argument': 0,
			'@typescript-eslint/no-unsafe-assignment': 0,
			'@typescript-eslint/no-unused-vars': [2, { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/prefer-nullish-coalescing': [
				2,
				{ ignoreMixedLogicalExpressions: true, ignorePrimitives: { boolean: true, string: true } },
			],
			'@typescript-eslint/restrict-template-expressions': [2, { allowNumber: true }],
			// The architecture, stated as an error rather than as prose. `docs/11-architecture.md`
			// is the specification; this is its enforcement. Two axes meet here: the FSD layers of
			// the interface, and the tiers of `src/server`, which is not an FSD layer.
			//
			// `default: 'disallow'` is the whole point. With `allow` as the default, a newly added
			// element type silently gets access to everything, and nobody notices for months.
			'boundaries/dependencies': [
				2,
				{
					default: 'disallow',
					rules: [
						// --- the server axis: kernel/db -> model -> repo -> usecase -> jobs ---

						// A shared schema sits below everything and depends on nothing but zod and its
						// own domain's siblings. It is the only element in `src/server` the interface
						// may name, so its own dependencies have to stay empty of anything that would
						// travel with it into a browser bundle.
						{
							allow: [{ to: { captured: { domain: '{{from.captured.domain}}' }, type: 'shared-schema' } }],
							from: { type: 'shared-schema' },
						},

						{ allow: [{ to: { type: 'server-kernel' } }], from: { type: 'server-kernel' } },
						{ allow: [{ to: { type: ['server-kernel', 'server-db'] } }], from: { type: 'server-db' } },

						// model is pure: kernel only. Never the database, never another domain. That is what
						// makes the decision functions testable as a table of cases, with no Postgres in sight.
						{ allow: [{ to: { type: ['server-kernel', 'shared-schema'] } }], from: { type: 'server-model' } },

						// A repo may use its OWN domain's model, and may never reach another domain's repo.
						// Cross-domain work belongs in a usecase. Without this line, subscriptions and
						// scheduling import each other within a week and the graph is a cycle forever.
						{
							allow: [
								{ to: { type: ['server-kernel', 'server-db'] } },
								{
									to: {
										captured: { domain: '{{from.captured.domain}}' },
										type: ['server-model', 'shared-schema'],
									},
								},
							],
							from: { type: 'server-repo' },
						},

						// The usecase tier is where cross-domain work is allowed to live, and the only tier
						// that opens a transaction.
						{
							allow: [
								{
									to: {
										type: [
											'server-kernel',
											'server-db',
											'server-model',
											'shared-schema',
											'server-repo',
											'server-usecase',
										],
									},
								},
							],
							from: { type: 'server-usecase' },
						},
						{ allow: [{ to: { type: ['server-kernel', 'server-usecase'] } }], from: { type: 'server-jobs' } },

						// --- the interface axis: the FSD layers, importing strictly downward ---
						// They reach the server only through a usecase: never a repo, never the database.

						{
							allow: [
								{ to: { type: ['views', 'widgets', 'features', 'entities', 'shared'] } },
								{ to: { type: ['server-usecase', 'server-kernel', 'shared-schema'] } },
							],
							from: { type: 'app' },
						},
						{
							allow: [
								{ to: { type: ['widgets', 'features', 'entities', 'shared'] } },
								{ to: { type: 'shared-schema' } },
							],
							from: { type: 'views' },
						},
						{
							allow: [{ to: { type: ['features', 'entities', 'shared'] } }, { to: { type: 'shared-schema' } }],
							from: { type: 'widgets' },
						},
						{
							allow: [
								{ to: { type: ['entities', 'shared'] } },
								{ to: { type: ['server-usecase', 'server-kernel', 'shared-schema'] } },
							],
							from: { type: 'features' },
						},
						{ allow: [{ to: { type: ['shared', 'shared-schema'] } }], from: { type: 'entities' } },
						{ allow: [{ to: { type: ['shared', 'shared-schema'] } }], from: { type: 'shared' } },
					],
				},
			],
			// The v5 name for `boundaries/dependencies`, still switched on by the plugin's recommended
			// config and deprecated since v6. Off, so the architecture is declared in exactly one place.
			'boundaries/element-types': 0,
			'check-file/filename-naming-convention': [
				2,
				{
					// src/app holds Next.js route files whose names are framework API
					// (page, layout, route, not-found, global-error). Kebab-case is the
					// convention that is *correct* there, so the rule still binds every
					// file — a stray MyHelper.tsx under src/app is still an error.
					'src/app/**/*.{ts,tsx}': 'KEBAB_CASE',
					'src/server/**/*.ts': 'CAMEL_CASE',
					'src/{views,widgets,features,entities,shared}/**/*.{js,ts}': 'CAMEL_CASE',
					'src/{views,widgets,features,entities,shared}/**/*.{jsx,tsx}': 'PASCAL_CASE',
				},
				{ ignoreMiddleExtensions: true },
			],
			'class-methods-use-this': 0,
			'consistent-return': 0,
			'guard-for-in': 0,
			'import/consistent-type-specifier-style': [2, 'prefer-inline'],
			'import/extensions': 0,
			// The backstop behind the boundaries rules. Even if the element definitions drift, a
			// cycle becomes a lint error rather than a surprise months later, once it is load-bearing.
			'import/no-cycle': [2, { ignoreExternal: true, maxDepth: Infinity }],
			'import/no-default-export': 2,
			// Test files and the tooling that runs them legitimately import devDependencies.
			// `**/*.spec.ts` was already the declared convention, so tests are named that way
			// rather than the rule being widened to `*.test.ts` as well.
			'import/no-extraneous-dependencies': [
				2,
				{ devDependencies: ['**/*.spec.ts', '*.config.{js,mjs,ts}', 'vitest.*.ts'] },
			],
			'import/prefer-default-export': 0,
			'jsx-a11y/click-events-have-key-events': 0,
			'jsx-a11y/label-has-associated-control': 0,
			'jsx-a11y/no-static-element-interactions': 0,
			'max-len': [1, { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, tabWidth: 3 }],
			'no-inner-declarations': 0,
			'no-nested-ternary': 0,
			'no-param-reassign': 0,
			'no-plusplus': 0,
			'no-restricted-exports': 0,
			'no-restricted-syntax': [
				2,
				...REACT_NAMESPACE_RESTRICTIONS,
				...DESIGN_TOKEN_RESTRICTIONS,
				...BOOLEAN_PROP_RESTRICTIONS,
			],
			'no-return-assign': 0,
			'no-shadow': 0,
			'no-unreachable': 2,
			'no-unsafe-optional-chaining': [2, { disallowArithmeticOperators: false }],
			'no-void': [2, { allowAsStatement: true }],
			'perfectionist/sort-imports': [2, { internalPattern: [], newlinesBetween: 0, type: 'natural' }],
			'perfectionist/sort-intersection-types': [
				2,
				{
					groups: ['unknown', 'conditional', 'intersection', 'union', 'literal', 'keyword', 'nullish'],
					type: 'natural',
				},
			],
			'perfectionist/sort-modules': 0,
			'perfectionist/sort-named-exports': 0,
			'perfectionist/sort-union-types': [
				2,
				{
					groups: ['unknown', 'conditional', 'intersection', 'union', 'literal', 'keyword', 'nullish'],
					type: 'natural',
				},
			],
			'prefer-const': [1, { destructuring: 'all', ignoreReadBeforeAssign: false }],
			'prefer-template': 0,
			'prettier/prettier': 1,
			'react-refresh/only-export-components': [2, { allowConstantExport: true }],
			'react/button-has-type': 0,
			'react/jsx-filename-extension': [2, { extensions: ['.jsx', '.tsx'] }],
			'react/jsx-key': 2,
			'react/jsx-no-leaked-render': 0,
			'react/jsx-props-no-spreading': 0,
			'react/require-default-props': 0,
			'sort-react-dependency-arrays/sort': 1,
			yoda: 1,
		},
		settings: {
			// Listed from the outside in. `src/pages` is deliberately absent and must never exist:
			// Next.js would activate the Pages Router for it. The FSD "pages" layer is `src/views`.
			'boundaries/elements': [
				{ pattern: 'src/app', type: 'app' },
				{ pattern: 'src/views/*', type: 'views' },
				{ pattern: 'src/widgets/*', type: 'widgets' },
				{ pattern: 'src/features/*', type: 'features' },
				{ pattern: 'src/entities/*', type: 'entities' },
				{ pattern: 'src/shared', type: 'shared' },

				// The server tiers. `capture: ['domain']` is what lets a repo be restricted to its own
				// domain's model without naming every domain here.
				{ pattern: 'src/server/kernel', type: 'server-kernel' },
				{ pattern: 'src/server/db', type: 'server-db' },

				// A validation schema both sides read, and the one thing inside `src/server` the
				// interface may import. Listed BEFORE `server-model` because the first matching
				// descriptor wins and this one is the narrower of the two.
				//
				// The boundary is the filename, not the directory, and that is deliberate:
				// `src/server/identity/model/invitationToken.ts` hashes invitation secrets with
				// `node:crypto`, so a rule that opened the whole `model` tier would open that too.
				// `src/server/db/schemaPurity.spec.ts` enforces the other half — these files carry
				// no `server-only` and import nothing but zod and their own domain's siblings.
				{ capture: ['domain'], mode: 'full', pattern: 'src/server/*/model/*.schema.ts', type: 'shared-schema' },

				{ capture: ['domain'], pattern: 'src/server/*/model', type: 'server-model' },
				{ capture: ['domain'], pattern: 'src/server/*/repo', type: 'server-repo' },
				{ capture: ['domain'], pattern: 'src/server/*/usecase', type: 'server-usecase' },
				{ pattern: 'src/server/jobs', type: 'server-jobs' },
			],
			// Without this, `import/no-cycle` silently does nothing in a TypeScript project.
			// eslint-plugin-import only builds an export map for extensions listed here, and the
			// inherited airbnb value stops at .js/.jsx/.mjs — so every .ts dependency is skipped,
			// the graph comes back empty, and the rule reports nothing while appearing to pass.
			'import/extensions': ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
			'import/resolver': {
				typescript: {
					alwaysTryTypes: false,
				},
			},
		},
	},
	{
		files: ['src/main.tsx', 'src/vite-env.d.ts', '**/use[A-Z]*.tsx'],
		rules: {
			'check-file/filename-naming-convention': 0,
		},
	},
	{
		// FSD segments are a slice's internal implementation detail — only the slice root index.ts
		// decides what leaves it. shared/{api,config,lib,ui}/index.ts are exempt: the shared layer has
		// no slices for those segments, so the segment barrel *is* its public API.
		files: ['src/{views,widgets,features,entities}/*/{ui,api,model}/index.ts'],
		rules: {
			'no-restricted-syntax': [
				2,
				{
					message:
						'No index.ts in an FSD segment. Export through the slice root index.ts instead, and import the file directly within the slice.',
					selector: 'Program',
				},
			],
		},
	},
	{
		// Prisma's schema tooling. A seed is a command-line script: it reports what it did on
		// stdout and imports the dev-only generated client. It is not application code and never
		// runs inside a request.
		files: ['prisma/**/*.ts'],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			'import/no-extraneous-dependencies': 0,
			'no-console': 0,
		},
	},
	{
		// Next.js entry points. A default export is how the framework finds a route, and
		// `metadata` is its documented API for page-level head tags — neither is a style
		// choice we can make. This is a closed set defined by Next, not a growing exemption
		// list: every file here is one whose contract belongs to the framework.
		files: [
			'src/app/**/{page,layout,route,loading,error,not-found,template,default,global-error}.{ts,tsx}',
			'src/middleware.ts',
			'*.config.{js,mjs,ts}',
		],
		rules: {
			'import/no-default-export': 0,
			'react-refresh/only-export-components': 0,
		},
	},
	{
		// src/server runs in Node, never in the browser. The import restrictions are the axis
		// boundary made unskippable: the server domain knows nothing about React, about Next, or
		// about any interface layer, which is what keeps it testable without a renderer.
		files: ['src/server/**/*.ts'],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			'no-restricted-imports': [
				2,
				{
					paths: [
						{ message: 'src/server never imports React.', name: 'react' },
						{ message: 'src/server never imports React.', name: 'react-dom' },
					],
					patterns: [
						{
							group: ['next', 'next/*', '@app/*', '@pages/*', '@widgets/*', '@features/*', '@entities/*'],
							message:
								'src/server never imports Next.js or an interface layer. Framework concerns ' +
								'(revalidation, headers, redirects) belong in the Server Action that calls the usecase.',
						},
					],
				},
			],
		},
	},
	{
		files: ['eslint.config.js'],
		rules: {
			'@typescript-eslint/no-unsafe-call': 0,
			'@typescript-eslint/no-unsafe-member-access': 0,
			'import/extensions': 0,
			'import/no-extraneous-dependencies': 0,
			'import/no-relative-packages': 0,
			'import/no-unresolved': 0,
		},
	},
]);
