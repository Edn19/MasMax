import Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VideoSource, VideoType } from '../types/models';

const playbackError = 'No se pudo reproducir el video. Verifica que el enlace sea publico o que el formato sea compatible.';

function driveFileId(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? url.searchParams.get('id');
  } catch {
    return null;
  }
}

export function VideoPlayer({
  src,
  type,
  source,
  originalSrc,
  poster,
}: {
  src: string;
  type: VideoType;
  source?: VideoSource;
  originalSrc?: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveFallback, setDriveFallback] = useState(false);
  const isDrive = type === 'DRIVE' || source === 'DRIVE';
  const previewUrl = useMemo(() => {
    const id = driveFileId(originalSrc || src);
    return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : null;
  }, [originalSrc, src]);

  useEffect(() => {
    setDriveFallback(false);
    setError(null);
  }, [src, type]);

  useEffect(() => {
    if (type === 'EMBED' || (isDrive && driveFallback)) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    if (type === 'HLS' && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(playbackError);
      });
      return () => hls.destroy();
    }

    if (type === 'HLS' && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }
    if (type === 'HLS') {
      setError(playbackError);
      return;
    }
    video.src = src;
  }, [driveFallback, isDrive, src, type]);

  if (type === 'EMBED' || (isDrive && driveFallback)) {
    const iframeSrc = isDrive ? previewUrl : src;
    if (!iframeSrc) return <VideoError message={playbackError} />;
    try {
      const parsed = new URL(iframeSrc);
      const allowed = String(import.meta.env.VITE_ALLOWED_EMBED_DOMAINS ?? 'youtube.com,player.vimeo.com,drive.google.com')
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:' || !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
        return <VideoError message="El enlace embed no esta permitido." />;
      }
    } catch {
      return <VideoError message={playbackError} />;
    }
    return (
      <div>
        <iframe
          src={iframeSrc}
          title="Reproductor de video"
          className="aspect-video w-full rounded-lg border border-line bg-black"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {isDrive && <p className="mt-3 text-sm text-slate-400">Google Drive debe estar compartido como “cualquier persona con el enlace”. Drive puede limitar la reproduccion por permisos o ancho de banda.</p>}
      </div>
    );
  }

  return (
    <div>
      <video
        ref={videoRef}
        className="aspect-video w-full rounded-lg border border-line bg-black"
        controls
        playsInline
        preload="metadata"
        poster={poster}
        onError={() => {
          if (isDrive && previewUrl) setDriveFallback(true);
          else setError(playbackError);
        }}
      />
      {error && <VideoError message={error} />}
    </div>
  );
}

function VideoError({ message }: { message: string }) {
  return <p className="mt-3 rounded-lg border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{message}</p>;
}
