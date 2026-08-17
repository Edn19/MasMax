import Hls from 'hls.js';
import { Captions, FastForward, LoaderCircle, Maximize, PictureInPicture2, RefreshCw, Rewind, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiText, putJson, putJsonKeepalive } from '../lib/api';
import { clearPendingProgress, ProgressPayload, readPendingProgress, storePendingProgress } from '../lib/pending-progress';
import { SubtitleTrack, VideoSource, VideoType, WatchHistory } from '../types/models';
import { loadPlayerPreferences, playbackSpeeds, PlayerPreferences, savePlayerPreferences } from './player/player-preferences';

const playbackError = 'No se pudo reproducir el video. Verifica que el enlace sea publico o que el formato sea compatible.';
function driveFileId(value: string) { try { const url = new URL(value); return url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? url.searchParams.get('id'); } catch { return null; } }

type PlaybackMarkers = { introStartSec?: number; introEndSec?: number; recapStartSec?: number; recapEndSec?: number };
type NextItem = { label: string; onPlay: () => void };
type PlayerProps = { src?: string; type: VideoType; source?: VideoSource; originalSrc?: string; poster?: string; episodeId?: string; movieId?: string; subtitles?: SubtitleTrack[]; markers?: PlaybackMarkers; nextItem?: NextItem };
type QualityOption = { index: number; height: number; label: string };
type AudioOption = { index: number; label: string };

export function VideoPlayer({ src = '', type, source, originalSrc, poster, episodeId, movieId, subtitles = [], markers = {}, nextItem }: PlayerProps) {
  const [preferences, setPreferences] = useState<PlayerPreferences>(() => loadPlayerPreferences());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSavedRef = useRef(-1);
  const startedRef = useRef(false);
  const retryRef = useRef(0);
  const initialQualityRef = useRef(preferences.quality);
  const nextItemRef = useRef(nextItem);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [driveFallback, setDriveFallback] = useState(false);
  const [playbackSrc, setPlaybackSrc] = useState(src);
  const [playbackType, setPlaybackType] = useState<VideoType>(type);
  const [authorizedOriginalSrc, setAuthorizedOriginalSrc] = useState(originalSrc);
  const [subtitleSources, setSubtitleSources] = useState<Array<{ track: SubtitleTrack; src: string }>>([]);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioOption[]>([]);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSubtitle, setSelectedSubtitle] = useState('-1');
  const [currentTime, setCurrentTime] = useState(0);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const isDrive = type === 'DRIVE' || source === 'DRIVE';
  const isEmbedded = type === 'EMBED' || (isDrive && driveFallback);
  const previewUrl = useMemo(() => { const id = driveFileId(authorizedOriginalSrc || originalSrc || src); return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : null; }, [authorizedOriginalSrc, originalSrc, src]);
  nextItemRef.current = nextItem;

  const updatePreferences = useCallback((change: Partial<PlayerPreferences>) => {
    setPreferences((current) => { const next = { ...current, ...change }; if (change.quality !== undefined) initialQualityRef.current = change.quality; savePlayerPreferences(next); return next; });
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
  }, []);
  const fullscreen = useCallback(() => { void containerRef.current?.requestFullscreen?.(); }, []);
  const pictureInPicture = useCallback(() => { const video = videoRef.current; if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement) void video.requestPictureInPicture(); }, []);

  const saveProgress = useCallback((completed = false, force = false) => {
    const video = videoRef.current;
    if (!video || (!episodeId && !movieId) || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (!startedRef.current && video.currentTime <= 0) return;
    const positionSec = Math.floor(video.currentTime);
    if (!force && Math.abs(positionSec - lastSavedRef.current) < 3) return;
    lastSavedRef.current = positionSec;
    const payload: ProgressPayload = { episodeId, movieId, positionSec, durationSec: Math.floor(video.duration), completed };
    if (force) storePendingProgress(payload);
    const request = force ? putJsonKeepalive<WatchHistory>('/me/progress', payload) : putJson<WatchHistory>('/me/progress', payload);
    void request.then(() => clearPendingProgress(payload)).catch(() => undefined);
  }, [episodeId, movieId]);

  useEffect(() => {
    const pending = readPendingProgress();
    if (!pending) return;
    void putJson<WatchHistory>('/me/progress', pending).then(() => clearPendingProgress(pending)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    const urls: string[] = [];
    Promise.all(subtitles.filter((track) => track.isActive).map(async (track) => {
      const content = await apiText(`/subtitles/${track.id}/content`);
      const blobUrl = URL.createObjectURL(new Blob([content], { type: 'text/vtt;charset=utf-8' }));
      urls.push(blobUrl);
      return { track, src: blobUrl };
    })).then((tracks) => { if (mounted) { setSubtitleSources(tracks); const defaultIndex = tracks.findIndex(({ track }) => track.isDefault); setSelectedSubtitle(defaultIndex >= 0 ? String(defaultIndex) : '-1'); } }).catch((reason: Error) => { if (mounted) setError(`No se pudieron cargar los subtitulos: ${reason.message}`); });
    return () => { mounted = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [subtitles]);

  useEffect(() => {
    setDriveFallback(false); setError(null); setLoading(true); setPlaybackSrc(src); setPlaybackType(type); setQualities([]); setAudioTracks([]); setNextCountdown(null);
    lastSavedRef.current = -1; startedRef.current = false; retryRef.current = 0;
    if (episodeId || movieId) {
      const params = new URLSearchParams(episodeId ? { episodeId } : { movieId: movieId! });
      api<{ url: string; type?: 'hls' | 'original' | 'remux'; playback?: { type: 'hls' | 'original' | 'remux'; url: string }; originalUrl?: string }>(`/media/authorize?${params}`).then((result) => { const playback = result.playback ?? { type: result.type ?? (type === 'HLS' ? 'hls' : 'original'), url: result.url }; setPlaybackSrc(playback.url); setPlaybackType(playback.type === 'hls' ? 'HLS' : 'MP4'); setAuthorizedOriginalSrc(result.originalUrl); }).catch((reason: Error) => setError(reason.message));
    }
  }, [src, source, type, episodeId, movieId]);

  useEffect(() => {
    if (isEmbedded) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    let hls: Hls | undefined;
    if (playbackType === 'HLS' && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true }); hlsRef.current = hls;
      hls.loadSource(playbackSrc); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const options = hls!.levels.map((level, index) => ({ index, height: level.height, label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps` }));
        setQualities(options);
        if (initialQualityRef.current !== 'auto') {
          const preferred = [...options].sort((a, b) => Math.abs(a.height - Number(initialQualityRef.current)) - Math.abs(b.height - Number(initialQualityRef.current)))[0];
          if (preferred) hls!.currentLevel = preferred.index;
        }
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => setAudioTracks(data.audioTracks.map((track, index) => ({ index, label: track.name || track.lang || `Audio ${index + 1}` }))));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (retryRef.current++ < 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls!.startLoad(); return; }
        if (retryRef.current++ < 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls!.recoverMediaError(); return; }
        setLoading(false); setError(playbackError);
      });
    } else if (playbackType === 'HLS' && video.canPlayType('application/vnd.apple.mpegurl')) video.src = playbackSrc;
    else if (playbackType === 'HLS') { setLoading(false); setError(playbackError); }
    else video.src = playbackSrc;
    return () => { hls?.destroy(); if (hlsRef.current === hls) hlsRef.current = null; };
  }, [isEmbedded, playbackSrc, playbackType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isEmbedded) return;
    video.volume = preferences.volume;
    video.playbackRate = preferences.speed;
  }, [isEmbedded, preferences.speed, preferences.volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || (!episodeId && !movieId) || isEmbedded) return;
    const params = new URLSearchParams(episodeId ? { episodeId } : { movieId: movieId! });
    api<WatchHistory | null>(`/me/progress?${params}`).then((item) => { if (item && item.positionSec > 0 && !item.completedAt) video.currentTime = item.positionSec; }).catch(() => undefined);
    const onPlay = () => { if (!startedRef.current) { startedRef.current = true; saveProgress(false, true); } };
    const onPause = () => saveProgress(false, true);
    const onEnded = () => { saveProgress(true, true); if (nextItemRef.current && preferences.autoplayNext) setNextCountdown(5); };
    const onLeave = () => saveProgress(false, true);
    const interval = window.setInterval(() => { if (!video.paused) saveProgress(); }, 15_000);
    video.addEventListener('play', onPlay); video.addEventListener('pause', onPause); video.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', onLeave);
    return () => { window.clearInterval(interval); video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); video.removeEventListener('ended', onEnded); window.removeEventListener('pagehide', onLeave); saveProgress(false, true); };
  }, [episodeId, isEmbedded, movieId, playbackSrc, preferences.autoplayNext, saveProgress]);

  useEffect(() => {
    if (nextCountdown === null || !nextItem) return;
    if (nextCountdown <= 0) { nextItem.onPlay(); return; }
    const timeout = window.setTimeout(() => setNextCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [nextCountdown, nextItem]);

  useEffect(() => {
    if (isEmbedded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      const video = videoRef.current; if (!video) return;
      if (event.key === ' ' || event.key.toLowerCase() === 'k') { event.preventDefault(); void (video.paused ? video.play() : Promise.resolve(video.pause())); }
      else if (event.key === 'ArrowLeft') seekBy(-10);
      else if (event.key === 'ArrowRight') seekBy(10);
      else if (event.key.toLowerCase() === 'f') fullscreen();
      else if (event.key.toLowerCase() === 'm') video.muted = !video.muted;
      else if (event.key.toLowerCase() === 'c') setSelectedSubtitle((value) => value === '-1' && subtitleSources.length ? '0' : '-1');
    };
    document.addEventListener('keydown', onKeyDown); return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, isEmbedded, seekBy, subtitleSources.length]);

  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    Array.from(video.textTracks).forEach((track, index) => { track.mode = selectedSubtitle === String(index) ? 'showing' : 'disabled'; });
  }, [selectedSubtitle, subtitleSources]);

  const skipTarget = markerTarget(currentTime, markers);
  const retry = () => { setError(null); setLoading(true); retryRef.current = 0; if (hlsRef.current) hlsRef.current.startLoad(); else videoRef.current?.load(); };

  if (isEmbedded) {
    const iframeSrc = isDrive ? previewUrl : playbackSrc;
    if (!iframeSrc || !isAllowedEmbed(iframeSrc)) return <VideoError message={iframeSrc ? 'El enlace embed no esta permitido.' : playbackError} />;
    return <div ref={containerRef} data-spatial-ignore className="relative"><iframe src={iframeSrc} title="Reproductor de video" className="aspect-video w-full rounded-lg border border-line bg-black" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />{isDrive && <p className="mt-3 text-sm text-slate-400">Google Drive debe estar compartido como cualquier persona con el enlace. Drive puede limitar la reproduccion.</p>}{subtitles.length > 0 && <p className="mt-2 text-sm text-slate-400">Las pistas locales no pueden superponerse sobre un reproductor embed externo.</p>}{nextItem && <button type="button" onClick={nextItem.onPlay} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink"><SkipForward size={17} /> Siguiente episodio</button>}</div>;
  }

  return <div ref={containerRef} data-spatial-ignore aria-label="Reproductor multimedia" className="relative overflow-hidden rounded-2xl border border-line bg-black shadow-2xl">
    <div className="relative">
      <video ref={videoRef} className="aspect-video w-full bg-black" controls playsInline preload="metadata" poster={poster}
        onLoadStart={() => setLoading(true)} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onCanPlay={() => setLoading(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onVolumeChange={(event) => updatePreferences({ volume: event.currentTarget.volume })}
        onError={() => { setLoading(false); if (isDrive && previewUrl) setDriveFallback(true); else setError(playbackError); }}>
        {subtitleSources.map(({ track, src: trackSrc }) => <track key={track.id} kind={track.isForced ? 'captions' : 'subtitles'} src={trackSrc} srcLang={track.language} label={track.label} default={track.isDefault} data-forced={track.isForced ? 'true' : undefined} />)}
      </video>
      {loading && !error && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35"><LoaderCircle className="animate-spin text-brand" size={38} /><span className="sr-only">Cargando video</span></div>}
      {skipTarget && <button type="button" onClick={() => { if (videoRef.current) videoRef.current.currentTime = skipTarget.end; }} className="absolute bottom-16 right-4 rounded-lg border border-white/30 bg-black/80 px-4 py-2 text-sm font-bold text-white hover:bg-brand hover:text-ink">Omitir {skipTarget.label}</button>}
      {nextCountdown !== null && nextItem && <div className="absolute inset-0 grid place-items-center bg-black/75"><div className="text-center"><p className="text-lg font-bold text-white">Siguiente episodio en {nextCountdown}s</p><p className="mt-1 text-sm text-slate-300">{nextItem.label}</p><div className="mt-4 flex gap-3"><button type="button" onClick={nextItem.onPlay} className="rounded-lg bg-brand px-4 py-2 font-bold text-ink">Reproducir ahora</button><button type="button" onClick={() => setNextCountdown(null)} className="rounded-lg border border-white/30 px-4 py-2 text-white">Cancelar</button></div></div></div>}
    </div>
    <div className="flex flex-wrap items-center gap-2 bg-panel/95 p-3 text-sm text-slate-200">
      <PlayerButton label="Retroceder 10 segundos" onClick={() => seekBy(-10)}><Rewind size={17} /></PlayerButton>
      <PlayerButton label="Avanzar 10 segundos" onClick={() => seekBy(10)}><FastForward size={17} /></PlayerButton>
      <label className="player-select">Velocidad <select value={preferences.speed} onChange={(event) => { const speed = Number(event.target.value); if (videoRef.current) videoRef.current.playbackRate = speed; updatePreferences({ speed }); }}>{playbackSpeeds.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
      {qualities.length > 0 && <label className="player-select">Calidad <select value={preferences.quality} onChange={(event) => { const value = event.target.value === 'auto' ? 'auto' : Number(event.target.value); if (hlsRef.current) hlsRef.current.currentLevel = value === 'auto' ? -1 : qualities.find((quality) => quality.height === value)?.index ?? -1; updatePreferences({ quality: value }); }}><option value="auto">Auto</option>{qualities.map((quality) => <option key={quality.index} value={quality.height}>{quality.label}</option>)}</select></label>}
      {audioTracks.length > 1 && <label className="player-select">Audio <select value={selectedAudio} onChange={(event) => { const index = Number(event.target.value); setSelectedAudio(index); if (hlsRef.current) hlsRef.current.audioTrack = index; }}>{audioTracks.map((track) => <option key={track.index} value={track.index}>{track.label}</option>)}</select></label>}
      {subtitleSources.length > 0 && <label className="player-select"><Captions size={16} /> <select aria-label="Subtitulos" value={selectedSubtitle} onChange={(event) => setSelectedSubtitle(event.target.value)}><option value="-1">Subtitulos: No</option>{subtitleSources.map(({ track }, index) => <option key={track.id} value={index}>{track.label}</option>)}</select></label>}
      <label className="ml-auto inline-flex items-center gap-2"><input type="checkbox" checked={preferences.autoplayNext} onChange={(event) => updatePreferences({ autoplayNext: event.target.checked })} /> Reproduccion automatica</label>
      {document.pictureInPictureEnabled && <PlayerButton label="Imagen en imagen" onClick={pictureInPicture}><PictureInPicture2 size={17} /></PlayerButton>}
      <PlayerButton label="Pantalla completa" onClick={fullscreen}><Maximize size={17} /></PlayerButton>
      {nextItem && <button type="button" onClick={nextItem.onPlay} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 font-bold text-ink"><SkipForward size={17} /> Siguiente</button>}
    </div>
    {error && <VideoError message={error} onRetry={retry} />}
  </div>;
}

function markerTarget(time: number, markers: PlaybackMarkers) {
  if (markers.introStartSec !== undefined && markers.introEndSec !== undefined && time >= markers.introStartSec && time < markers.introEndSec) return { label: 'intro', end: markers.introEndSec };
  if (markers.recapStartSec !== undefined && markers.recapEndSec !== undefined && time >= markers.recapStartSec && time < markers.recapEndSec) return { label: 'resumen', end: markers.recapEndSec };
  return null;
}
function isAllowedEmbed(value: string) { try { const parsed = new URL(value); const allowed = String(import.meta.env.VITE_ALLOWED_EMBED_DOMAINS ?? 'youtube.com,player.vimeo.com,drive.google.com').split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean); const host = parsed.hostname.toLowerCase(); return parsed.protocol === 'https:' && allowed.some((domain) => host === domain || host.endsWith(`.${domain}`)); } catch { return false; } }
function PlayerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) { return <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-lg border border-line p-2 hover:border-brand hover:text-brand">{children}</button>; }
function VideoError({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div className="m-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-coral/40 bg-coral/10 p-3 text-sm text-coral"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-coral/50 px-3 py-2 font-bold"><RefreshCw size={16} /> Reintentar</button>}</div>; }
