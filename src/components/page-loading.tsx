export function PageLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
    >
      <span className="sr-only" role="status">
        Loading page
      </span>
      <div className="motion-safe:animate-pulse">
        <div className="h-3 w-28 rounded-full bg-forest/15" />
        <div className="mt-4 h-10 w-52 max-w-full rounded-xl bg-ink/10 sm:w-72" />
        <div className="mt-4 h-4 w-full max-w-xl rounded-full bg-ink/8" />
        <div className="mt-2 h-4 w-3/4 max-w-md rounded-full bg-ink/8" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="h-44 rounded-3xl border border-line bg-surface/70" />
          <div className="h-44 rounded-3xl border border-line bg-surface/70" />
        </div>
      </div>
    </main>
  );
}
