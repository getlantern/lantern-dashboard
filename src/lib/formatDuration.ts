// The VPS connection-duration histogram records milliseconds at close.
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(ms >= 10_000 ? 1 : 2)} s`;
  return `${ms.toFixed(ms >= 100 ? 0 : 1)} ms`;
}
