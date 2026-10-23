import Link from "next/link";

// Shared layout for the public legal pages (privacy, terms).
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-white">
          ← Back to TravelTomo
        </Link>
        <h1 className="mt-8 text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated {updated}</p>
        <div className="mt-10 space-y-8 leading-relaxed text-zinc-300 [&_a]:text-[#FCA581] [&_a:hover]:underline [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
        <p className="mt-12 text-sm text-zinc-500">
          <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link> ·{" "}
          <Link href="/help">Help &amp; Support</Link>
        </p>
      </article>
    </main>
  );
}
