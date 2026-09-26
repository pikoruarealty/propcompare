export default function DeveloperLoading() {
  return (
    <main className="bg-background min-h-screen px-[var(--layout-margin-mobile)] py-16 md:px-[var(--layout-margin-desktop)]">
      <div
        role="status"
        aria-label="Loading developer analytics"
        className="mx-auto max-w-[var(--layout-max-width)] animate-pulse"
      >
        <div className="bg-muted h-12 max-w-80 rounded-lg" />
        <div className="bg-muted mt-8 h-10 max-w-xl rounded-lg" />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="border-border bg-muted h-32 rounded-lg border"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
