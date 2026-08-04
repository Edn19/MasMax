import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Series } from '../types/models';
import { StatusBadge } from './StatusBadge';
import { SmartImage } from './SmartImage';

export function SeriesCard({ item }: { item: Series }) {
  return (
    <Link
      to={`/series/${item.slug}`}
      aria-label={`Ver serie ${item.title}`}
      className="content-card group h-full"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
        <SmartImage src={item.cover} alt={`Portada de ${item.title}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent opacity-85" />
        <div className="absolute bottom-3 left-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-brand text-ink opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <Play size={18} fill="currentColor" />
        </div>
      </div>
      <div className="space-y-2.5 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-base font-bold text-white">{item.title}</h3>
          <span className="shrink-0 text-xs text-slate-400">{item.year}</span>
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
