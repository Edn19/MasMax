import { SeriesStatus } from '../types/models';

const labels: Record<SeriesStatus, string> = {
  AIRING: 'En emision',
  FINISHED: 'Finalizado',
  PAUSED: 'Pausado',
};

const styles: Record<SeriesStatus, string> = {
  AIRING: 'border-mint/30 bg-mint/10 text-mint',
  FINISHED: 'border-brand/30 bg-brand/10 text-brand',
  PAUSED: 'border-coral/30 bg-coral/10 text-coral',
};

export function StatusBadge({ status }: { status: SeriesStatus }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
