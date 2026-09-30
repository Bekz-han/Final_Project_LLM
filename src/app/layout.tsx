import { THEME_INIT_SCRIPT } from '@shared/lib';
import { type Metadata } from 'next';
import { Inter } from 'next/font/google';
import { type ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
	description: 'Кого из клиентов сети проверять первым и почему: роли, кластеры и приоритеты по графу переводов',
	title: 'Граф денег',
};

/**
 * Inter, and no request ever leaves the browser to fetch it.
 *
 * `next/font/google` reads Google's font files **at build time**, copies them into the
 * application's own static output and emits a `@font-face` pointing at our origin. Nothing in
 * the rendered page mentions Google, so a visitor's IP address never reaches it — which is why
 * `docs/design-system.md` bans the CDN.
 *
 * What it does cost: the build needs to reach Google once, and the font files are not in the
 * repository. For an air-gapped or fully repeatable build, commit the files and switch to
 * `next/font/local`. The rendered result is identical either way.
 *
 * Add a subset here for any non-Latin script the product needs — `cyrillic`, `greek`,
 * `vietnamese`. Without it those letters fall back to whatever the system has, mid-word.
 */
const inter = Inter({
	display: 'swap',
	// `cyrillic` is not optional for this product: the demo is in Russian, and without the subset
	// every Cyrillic letter falls back to a system font mid-word — visible on stage, in the one
	// sentence the judges read.
	subsets: ['cyrillic', 'latin'],
	variable: '--font-inter',
});

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html className={inter.variable} lang="ru" suppressHydrationWarning>
			<head>
				{/* eslint-disable-next-line react/no-danger -- must run before first paint or the page flashes */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body className="bg-canvas text-fg min-h-screen font-sans antialiased">{children}</body>
		</html>
	);
}
