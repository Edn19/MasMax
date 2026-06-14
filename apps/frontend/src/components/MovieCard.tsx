import { Clock3, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Movie } from '../types/models';

export function MovieCard({ item }: { item: Movie }) {
  return (
    <Link to={`/watch/movie/${item.slug}`} className="group overflow-hidden rounded-xl border border-line bg-panel/75 transition hover:-translate-y-1 hover:border-brand/50">
      <div className="relative">
        <img src={item.posterUrl} alt={item.title} className="aspect-[2/3] w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/45">
          <span className="grid h-12 w-12 scale-75 place-items-center rounded-full bg-brand text-ink opacity-0 transition group-hover:scale-100 group-hover:opacity-100">
            <Play size={21} fill="currentColor" />
          </span>
        </span>
      </div>
      <div className="p-4">
        <h3 className="truncate font-black text-white">{item.title}</h3>
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} /> {item.duration} min · {item.releaseYear}</p>
      </div>
    </Link>
  );
}
