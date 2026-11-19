export function ReportLoadingSkeleton({ label, detail = false }: { label: string; detail?: boolean }) {
  return (
    <div role="status" className={detail ? 'flex flex-1 flex-col gap-4 px-4 py-5' : 'divide-y divide-obsidian-border'}>
      <span className="sr-only">{label}</span>
      {(detail ? ['w-2/5', 'w-3/4', 'w-1/2', 'w-2/3'] : ['w-2/3', 'w-1/2', 'w-3/5']).map((width) => (
        <div key={width} aria-hidden="true" className={detail ? 'space-y-2' : 'space-y-2 px-3 py-3'}>
          <div className={`h-3 rounded bg-obsidian-surface ${width}`} />
          {!detail && <div className="h-2 w-1/3 rounded bg-obsidian-surface" />}
        </div>
      ))}
    </div>
  );
}
