import { ThemeToggle } from '@shared/ui/ThemeToggle';
import { type ReactNode } from 'react';

/**
 * The palette, made visible.
 *
 * A design system nobody can look at is a document, and documents drift from the stylesheet
 * silently. This page renders the tokens themselves — every swatch reads `var(--…)` at runtime,
 * so a token that was renamed or deleted shows up here as a blank square rather than as a
 * screen that looks subtly wrong three weeks later.
 *
 * Keep it as the product grows: add a section when a primitive is added, and use it to check
 * both themes at once.
 */
const SEMANTIC = [
	{ label: 'canvas', note: 'page background', token: '--color-canvas' },
	{ label: 'surface', note: 'cards, table rows', token: '--color-surface' },
	{ label: 'sunken', note: 'nested areas', token: '--color-surface-sunken' },
	{ label: 'surface-hover', note: 'control hover', token: '--color-surface-hover' },
	{ label: 'border', note: 'hairline', token: '--color-border' },
	{ label: 'border-strong', note: 'form controls', token: '--color-border-strong' },
	{ label: 'fg', note: 'primary text', token: '--color-fg' },
	{ label: 'fg-muted', note: 'secondary text', token: '--color-fg-muted' },
	{ label: 'fg-subtle', note: 'placeholder', token: '--color-fg-subtle' },
	{ label: 'accent', note: 'primary actions', token: '--color-accent' },
	{ label: 'accent-subtle', note: 'tinted ground', token: '--color-accent-subtle' },
];

const SEMANTIC_HUES = [
	{ bg: '--color-success-bg', label: 'success', token: '--color-success' },
	{ bg: '--color-warning-bg', label: 'warning', token: '--color-warning' },
	{ bg: '--color-danger-bg', label: 'danger', token: '--color-danger' },
	{ bg: '--color-info-bg', label: 'info', token: '--color-info' },
];

const BRAND = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const NEUTRAL = [0, 25, 50, 100, 150, 200, 300, 400, 450, 500, 600, 700, 800, 900, 950, 1000];

function Section({ children, title }: { children: ReactNode; title: string }) {
	return (
		<section className="border-border bg-surface rounded-lg border p-5">
			<h2 className="text-md mb-4 font-semibold">{title}</h2>
			{children}
		</section>
	);
}

export default function DesignPage() {
	return (
		<main className="mx-auto max-w-5xl px-6 py-10">
			<header className="mb-8 flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-fg-subtle text-xs font-medium tracking-widest uppercase">Reference</p>
					<h1 className="mt-1 text-2xl font-semibold tracking-tight">Design system</h1>
					<p className="text-fg-muted mt-1">
						Palette and tokens. The theme switches the semantic layer only, defined in one place in{' '}
						<code className="text-accent-fg">globals.css</code>.
					</p>
				</div>
				<ThemeToggle />
			</header>

			<div className="grid gap-5">
				<Section title="Semantic tokens">
					<div className="grid gap-2 sm:grid-cols-2">
						{SEMANTIC.map((item) => (
							<div className="border-border flex items-center gap-3 rounded-md border p-2" key={item.token}>
								<span
									className="border-border-strong size-9 shrink-0 rounded-sm border"
									style={{ background: `var(${item.token})` }}
								/>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">{item.label}</span>
									<span className="text-fg-muted block truncate text-xs">{item.note}</span>
								</span>
							</div>
						))}
					</div>
				</Section>

				<Section title="Status hues">
					<div className="flex flex-wrap gap-2">
						{SEMANTIC_HUES.map((item) => (
							<span
								className="rounded-full px-3 py-1 text-sm font-medium"
								key={item.label}
								style={{
									background: `var(${item.bg})`,
									color: `var(${item.token})`,
								}}
							>
								{item.label}
							</span>
						))}
					</div>
				</Section>

				<Section title="Status treatments">
					{/* Status is never colour alone: each of these also differs in border, weight or
					    decoration, so it survives a monochrome screen and a red-green viewer. */}
					<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
						<div className="border-border-strong bg-surface text-fg-muted rounded-md border border-dashed p-3 text-sm">
							Empty
						</div>
						<div className="border-border bg-surface-raised border-l-accent rounded-md border border-l-[3px] p-3 text-sm">
							Active
						</div>
						<div
							className="rounded-md border border-dashed p-3 text-sm"
							style={{
								background: 'var(--color-warning-bg)',
								borderColor: 'var(--color-warning)',
								color: 'var(--color-warning)',
							}}
						>
							Pending
						</div>
						<div className="border-border bg-surface-sunken text-fg-subtle rounded-md border p-3 text-sm line-through">
							Archived
						</div>
						<div
							className="rounded-md border-[1.5px] p-3 text-sm"
							style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
						>
							Conflict
						</div>
					</div>
				</Section>

				<Section title="Ramps">
					<p className="text-fg-muted mb-2 text-sm">Brand — violet</p>
					<div className="border-border mb-5 flex overflow-hidden rounded-md border">
						{BRAND.map((step) => (
							<span
								className="h-10 flex-1"
								key={step}
								style={{ background: `var(--brand-${step})` }}
								title={`brand-${step}`}
							/>
						))}
					</div>
					<p className="text-fg-muted mb-2 text-sm">Neutral — cool, faintly violet</p>
					<div className="border-border flex overflow-hidden rounded-md border">
						{NEUTRAL.map((step) => (
							<span
								className="h-10 flex-1"
								key={step}
								style={{ background: `var(--neutral-${step})` }}
								title={`neutral-${step}`}
							/>
						))}
					</div>
				</Section>

				<Section title="Type and density">
					<div className="space-y-1">
						<p className="tabular text-2xl font-semibold">124,500.00</p>
						<p className="text-xl font-semibold">Page heading</p>
						<p className="text-lg font-semibold">Section heading</p>
						<p className="text-md font-medium">Card heading</p>
						<p className="text-base">Body text, 14px — tables and forms.</p>
						<p className="text-fg-muted text-sm">Secondary text, 13px.</p>
						<p className="text-fg-subtle text-xs tracking-widest uppercase">Label, 12px</p>
					</div>
					<div className="mt-5 flex flex-wrap items-center gap-2">
						<button className="bg-accent text-on-accent hover:bg-accent-hover h-9 rounded-md px-4 text-sm font-medium transition-colors">
							Primary action
						</button>
						<button className="border-border-strong hover:bg-surface-hover h-9 rounded-md border px-4 text-sm font-medium transition-colors">
							Secondary
						</button>
						<button className="text-fg-muted hover:text-fg h-9 rounded-md px-4 text-sm font-medium transition-colors">
							Tertiary
						</button>
					</div>
				</Section>
			</div>
		</main>
	);
}
