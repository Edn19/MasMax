import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Series } from '../types/models';
import { StatusBadge } from './StatusBadge';

export function SeriesCard({ item }: { item: Series }) {
  return (
    <Link
      to={`/series/${item.slug}`}
      className="group block overflow-hidden rounded-lg border border-line bg-panel/70 shadow-glow transition hover:-translate-y-1 hover:border-brand/50"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
        <img src={item.cover} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent opacity-85" />
        <div className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-ink">
          <Play size={18} fill="currentColor" />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-base font-bold text-white">{item.title}</h3>
          <span className="text-sm text-slate-400">{item.year}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={item.status} />
          {item.genres.slice(0, 2).map((genre) => (
            <span key={genre.id} className="rounded-full border border-line px-2.5 py-1 text-xs text-slate-300">
              {genre.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
