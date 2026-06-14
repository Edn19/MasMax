import { Heart, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, deleteJson, postJson } from '../lib/api';
import { Favorite } from '../types/models';

export function FavoriteButton({ episodeId, movieId, onChanged }: { episodeId?: string; movieId?: string; onChanged?: () => void }) {
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const query = episodeId ? `episodeId=${encodeURIComponent(episodeId)}` : `movieId=${encodeURIComponent(movieId ?? '')}`;

  useEffect(() => {
    setLoading(true);
    api<{ favorite: boolean; favoriteId: string | null }>(`/favorites/check?${query}`)
      .then((result) => setFavoriteId(result.favoriteId))
      .catch(() => setFavoriteId(null))
      .finally(() => setLoading(false));
  }, [query]);

  async function toggle() {
    setLoading(true);
    try {
      if (favoriteId) {
        await deleteJson(`/favorites/${favoriteId}`);
        setFavoriteId(null);
        toast.success('Eliminado de favoritos');
      } else {
        const favorite = await postJson<Favorite>('/favorites', { episodeId, movieId });
        setFavoriteId(favorite.id);
        toast.success('Agregado a favoritos');
      }
      onChanged?.();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={toggle}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${favoriteId ? 'border-coral bg-coral/15 text-coral' : 'border-line bg-panel text-slate-200 hover:border-coral hover:text-coral'}`}
    >
      {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Heart size={18} fill={favoriteId ? 'currentColor' : 'none'} />}
      {favoriteId ? 'En favoritos' : 'Agregar a favoritos'}
    </button>
  );
}
