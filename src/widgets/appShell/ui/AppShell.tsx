import { ThemeToggle } from '@shared/ui/ThemeToggle';
import { ToastProvider } from '@shared/ui/Toast';
import { type ComponentType, type ReactNode, type SVGProps } from 'react';
import { NavLink } from './NavLink';

/**
 * The frame every screen sits in: a sidebar of labelled sections and a header.
 *
 * It takes plain values rather than reaching for the session or the database. A widget may
 * not import from `src/server/`, so whoever renders the shell decides which sections this
 * visitor gets and passes the answer in — filtering by permission, by feature flag, or not
 * at all.
 *
 * The gutter is 24px on a desktop and narrower below. Content stops at 1600px, which is where
 * a table stops being readable rather than where a screen stops being wide.
 */
export interface NavigationSection {
	href: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
	label: string;
}

export interface AppShellProps {
	children: ReactNode;
	sections: readonly NavigationSection[];
	title: string;
}

export function AppShell({ children, sections, title }: AppShellProps) {
	return (
		// The toast provider wraps the shell rather than the page, so a notice survives a
		// navigation: an action on one screen that sends somebody to another still gets to say
		// whether it worked.
		<ToastProvider>
			<div className="flex min-h-screen">
				<nav
					aria-label="Разделы"
					className="border-border bg-surface hidden w-60 shrink-0 flex-col gap-1 border-r p-3 md:flex"
				>
					<div className="mb-3 px-2 py-1.5">
						<p className="text-fg text-md font-semibold">{title}</p>
					</div>

					{sections.map((section) => (
						<NavLink href={section.href} key={section.href} label={section.label} variant="sidebar">
							<section.Icon aria-hidden className="size-5 shrink-0" />
						</NavLink>
					))}
				</nav>

				<div className="flex min-w-0 flex-1 flex-col">
					<header className="border-border bg-surface flex h-14 items-center justify-between gap-4 border-b px-3 md:px-6">
						{/* The same sections again on a phone, where the sidebar is gone. Horizontal and
					    scrollable rather than behind a hamburger: there are only a few. */}
						<nav aria-label="Разделы" className="flex gap-1 overflow-x-auto md:hidden">
							{sections.map((section) => (
								<NavLink href={section.href} key={section.href} label={section.label} variant="header">
									<section.Icon aria-hidden className="size-4 shrink-0" />
								</NavLink>
							))}
						</nav>

						<div className="ml-auto">
							<ThemeToggle />
						</div>
					</header>

					<main className="mx-auto w-full max-w-[1600px] flex-1 p-3 md:p-6">{children}</main>
				</div>
			</div>
		</ToastProvider>
	);
}
