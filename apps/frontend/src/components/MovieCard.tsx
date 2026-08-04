import { Clock3, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Movie } from '../types/models';
import { SmartImage } from './SmartImage';

export function MovieCard({ item }: { item: Movie }) {
  return (
    <Link to={`/watch/movie/${item.slug}`} aria-label={`Reproducir pelicula ${item.title}`} className="content-card group h-full">
      <div className="relative">
        <SmartImage src={item.posterUrl} alt={`Portada de ${item.title}`} className="aspect-[2/3] w-full object-cover transition duration-300 group-hover:scale-[1.035]" />
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/45">
          <span className="grid h-12 w-12 scale-75 place-items-center rounded-full bg-brand text-ink opacity-0 transition group-hover:scale-100 group-hover:opacity-100">
            <Play size={21} fill="currentColor" />
          </span>
        </span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 font-semibold leading-5 text-white">{item.title}</h3>
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} /> {item.duration} min · {item.releaseYear}</p>
      </div>
    </Link>
  );
}
