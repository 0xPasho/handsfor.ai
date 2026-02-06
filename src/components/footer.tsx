import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 sm:flex-row sm:justify-between">
        <span className="text-xs text-muted-foreground">
          handsfor.ai &mdash; Human hands for AI agents
        </span>
        <div className="flex items-center gap-6">
          <Link
            href="/tasks"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Tasks
          </Link>
          <a
            href="https://www.yellow.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Yellow Network
          </a>
        </div>
      </div>
    </footer>
  );
}
