import { AlertTriangle, Settings2 } from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SmartImage } from "../../components/SmartImage";
import { api, deleteJson, patchJson, postJson } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useVideoProcessingJobs } from "../../lib/video-processing-jobs";
import { isActiveProcessingJob, processingStageLabel } from "../../lib/video-processing-state";
import { Episode, EpisodePlaybackMode, EpisodeProcessingJob, Season, Series, VideoSource, VideoType } from "../../types/models";
import { Checkbox, DateInput, fieldA11y, FormActions, FormError, FormField, FormHint, FormLabel, FormSection, NumberInput, Select, TextArea, TextInput } from "../components/AdminForms";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, FormDisclosure, Panel, ResourceError } from "../components/AdminUi";
import { validatePlaybackMarkers, videoTypeForSource } from "../components/admin-utils";
import { UploadField } from "../components/UploadField";
import { BulkEpisodeTools } from "./BulkEpisodeTools";
import { CsvEpisodeImport } from "./CsvEpisodeImport";
import { EpisodeEditorSource, EpisodeFormState, episodeEditorErrorMessage, episodeFormToUpdatePayload, episodeToFormState, validateEpisodeBasicInfo, withEpisodeFormField, withEpisodePublished } from "./episode-editor";
import { applyHlsProcessingJob, applyRemuxProcessingJob } from "./episode-media-runtime";
import { buildEpisodeListQuery, episodeDeleteLabel, episodePageCount, episodeProcessingLabel, EpisodePublishedFilter, EpisodeVideoFilter } from "./episode-list";
import { episodeVideoError, episodeVideoIsReady, EpisodeVideoMode } from "./episode-video-linking";
import { EpisodeMediaSelector, SelectableEpisodeMedia } from "./EpisodeMediaSelector";
import { getMediaVersions, mediaCompatibilityMessage } from "../media/media-versions";

type EpisodeForm = Omit<EpisodeFormState, "seriesId" | "seasonId">;
type EditorLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  episodeId?: string;
  message?: string;
};
type AdminEpisodeResponse = {
  items: Episode[];
  total: number;
  page: number;
  limit: number;
};
const emptyEpisode = (): EpisodeForm => ({
  number: "",
  position: "",
  title: "",
  description: "",
  videoMode: "NONE",
  processingJobId: "",
  mediaFileId: "",
  processingJobStatus: "NONE",
  videoUrl: "",
  originalVideoUrl: "",
  remuxedVideoUrl: "",
  processedVideoUrl: "",
  playbackMode: "ORIGINAL",
  videoSource: "URL",
  videoType: "MP4",
  thumbnailUrl: "",
  durationSec: "",
  introStartSec: "",
  introEndSec: "",
  recapStartSec: "",
  recapEndSec: "",
  published: false,
  publishedAt: new Date().toISOString().slice(0, 10),
});

export function EpisodesAdminPage() {
  const series = useAsync<Series[]>(() => api("/admin/series"), []);
  const [seriesId, setSeriesId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [revision, setRevision] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [publishedFilter, setPublishedFilter] = useState<EpisodePublishedFilter>("ALL");
  const [videoFilter, setVideoFilter] = useState<EpisodeVideoFilter>("ALL");
  const [page, setPage] = useState(1);
  const limit = 20;
  const seasons = useAsync<Season[]>(() => (seriesId ? api(`/admin/series/${seriesId}/seasons`) : Promise.resolve([])), [seriesId, revision]);
  const episodes = useAsync<AdminEpisodeResponse>(() => (seasonId ? api(`/admin/episodes?${buildEpisodeListQuery({ seriesId, seasonId, search, published: publishedFilter, video: videoFilter, page, limit })}`) : Promise.resolve({ items: [], total: 0, page: 1, limit })), [seriesId, seasonId, search, publishedFilter, videoFilter, page, revision]);
  const gaps = useAsync<{ max: number; missing: number[] }>(() => (seasonId ? api(`/admin/seasons/${seasonId}/episode-gaps`) : Promise.resolve({ max: 0, missing: [] })), [seasonId, revision]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<EpisodeForm>(emptyEpisode);
  const [formDirty, setFormDirty] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectableEpisodeMedia | null>(null);
  const [persistedPlaybackMode, setPersistedPlaybackMode] = useState<EpisodePlaybackMode | null>(null);
  const [editorLoad, setEditorLoad] = useState<EditorLoadState>({
    status: "idle",
  });
  const pendingSeasonRef = useRef<{
    seriesId: string;
    seasonId: string;
  } | null>(null);
  const editorRequestRef = useRef(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Episode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [versionAction, setVersionAction] = useState<"HLS" | "REMUX" | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  const availableJobs = useAsync<EpisodeProcessingJob[]>(() => (formOpen ? api("/admin/video-processing/jobs/available") : Promise.resolve([])), [formOpen, revision]);
  const processing = useVideoProcessingJobs();

  useEffect(() => {
    const jobId = selectedMedia?.processingJobId;
    if (!jobId) return;
    const job = processing.jobs.find((item) => item.id === jobId);
    if (!job) return;
    setSelectedMedia((current) => current ? applyHlsProcessingJob(current, job) : current);
  }, [processing.jobs, selectedMedia?.processingJobId]);

  useEffect(() => {
    const jobId = selectedMedia?.remuxJobId;
    if (!jobId) return;
    const job = processing.jobs.find((item) => item.id === jobId);
    if (!job) return;
    setSelectedMedia((current) => current ? applyRemuxProcessingJob(current, job) : current);
  }, [processing.jobs, selectedMedia?.remuxJobId]);

  useEffect(() => {
    if (!seriesId && series.data?.[0] && editorLoad.status !== "loading") setSeriesId(series.data[0].id);
  }, [editorLoad.status, series.data, seriesId]);
  useEffect(() => {
    const pending = pendingSeasonRef.current;
    if (pending?.seriesId === seriesId) {
      if (seasons.data?.some((season) => season.id === pending.seasonId && season.seriesId === pending.seriesId)) {
        setSeasonId(pending.seasonId);
        pendingSeasonRef.current = null;
      }
      return;
    }
    if (!seasons.data?.some((season) => season.id === seasonId)) setSeasonId(seasons.data?.[0]?.id ?? "");
  }, [seasons.data, seasonId, seriesId]);
  const items = episodes.data?.items ?? [];
  const selectedVersions = useMemo(() => selectedMedia ? getMediaVersions({ ...selectedMedia, hlsStatus: selectedMedia.status }) : null, [selectedMedia]);
  const selectedProcessingJob = useMemo(() => form.processingJobId ? processing.jobs.find((job) => job.id === form.processingJobId) : undefined, [form.processingJobId, processing.jobs]);
  const activeProcessingJob = selectedProcessingJob && isActiveProcessingJob(selectedProcessingJob) ? selectedProcessingJob : undefined;
  useEffect(() => {
    if (!form.processingJobId || !selectedProcessingJob || isActiveProcessingJob(selectedProcessingJob)) return;
    setForm((current) => current.processingJobId === selectedProcessingJob.id ? { ...current, processingJobId: "", processingJobStatus: selectedProcessingJob.status } : current);
  }, [form.processingJobId, selectedProcessingJob]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const handleBulkChanged = useCallback(() => {
    setSelected([]);
    refresh();
  }, [refresh]);
  function reset() {
    editorRequestRef.current += 1;
    savingRef.current = false;
    pendingSeasonRef.current = null;
    setEditingId(null);
    setForm(emptyEpisode());
    setFormDirty(false);
    setSelectedMedia(null);
    setPersistedPlaybackMode(null);
    setErrors({});
    setEditorLoad({ status: "idle" });
    setFormOpen(false);
  }
  function createEpisode(number = "") {
    pendingSeasonRef.current = null;
    setEditingId(null);
    setForm({ ...emptyEpisode(), number });
    setFormDirty(false);
    setSelectedMedia(null);
    setPersistedPlaybackMode(null);
    setErrors({});
    setEditorLoad({ status: "ready" });
    setFormOpen(true);
    setFormDirty(false);
  }
  async function edit(episodeId: string) {
    const requestId = editorRequestRef.current + 1;
    editorRequestRef.current = requestId;
    setEditingId(episodeId);
    setFormOpen(true);
    setErrors({});
    setEditorLoad({ status: "loading", episodeId });
    try {
      const episode = await api<EpisodeEditorSource>(`/admin/episodes/${episodeId}`);
      if (editorRequestRef.current !== requestId) return;
      const next = episodeToFormState(episode);
      if (!next.seriesId || !next.seasonId) throw new Error("El episodio no tiene una serie y temporada validas.");
      const { seriesId: nextSeriesId, seasonId: nextSeasonId, ...nextForm } = next;
      pendingSeasonRef.current = {
        seriesId: nextSeriesId,
        seasonId: nextSeasonId,
      };
      setSeriesId(nextSeriesId);
      setSeasonId(nextSeasonId);
      setForm(nextForm);
      setFormDirty(false);
      setSelectedMedia(mediaFromEpisode(episode));
      setPersistedPlaybackMode(episode.playbackMode ?? nextForm.playbackMode);
      setEditorLoad({ status: "ready", episodeId });
    } catch (error) {
      if (editorRequestRef.current !== requestId) return;
      setEditorLoad({
        status: "error",
        episodeId,
        message: episodeEditorErrorMessage(error),
      });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const nextErrors = {
      ...validateEpisodeBasicInfo(form),
      ...validatePlaybackMarkers(form),
    };
    if (!seriesId) nextErrors.seriesId = "Selecciona una serie.";
    if (!seasonId) nextErrors.seasonId = "Selecciona una temporada.";
    const videoError = episodeVideoError(form.videoMode, form.videoUrl, form.processingJobId, form.mediaFileId);
    if (videoError) nextErrors.videoUrl = videoError;
    const selectedJob = [...(availableJobs.data ?? []), ...items.flatMap((item) => (item.processingJob ? [item.processingJob] : []))].find((job) => job.id === form.processingJobId);
    const formForSubmit = formWithRuntimeMedia(form, selectedMedia);
    const selectedPlaybackUrl = playbackUrlFor(formForSubmit, selectedMedia);
    const hasReadyVideo = episodeVideoIsReady(selectedPlaybackUrl, form.playbackMode === "HLS" ? selectedJob : undefined);
    if (form.published && !hasReadyVideo) nextErrors.published = form.playbackMode === "ORIGINAL" ? "El archivo original no es compatible para publicacion directa." : form.playbackMode === "REMUX" ? "El MP4 remux debe estar listo antes de publicar." : "El HLS debe estar listo antes de publicar.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return toast.error("Revisa los campos marcados antes de guardar");
    savingRef.current = true;
    setSaving(true);
    try {
      const updatePayload = episodeFormToUpdatePayload({ ...formForSubmit, seriesId, seasonId }, hasReadyVideo);
      const payload = editingId ? updatePayload : { ...updatePayload, seriesId };
      editingId ? await patchJson<Episode>(`/admin/episodes/${editingId}`, payload) : await postJson<Episode>("/admin/episodes", payload);
      toast.success(editingId ? "Episodio actualizado" : "Episodio creado");
      reset();
      refresh();
    } catch (error) {
      const message = (error as Error).message;
      setErrors((current) => ({ ...current, videoUrl: message }));
      toast.error(message);
      await refreshSelectedMedia();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function refreshSelectedMedia() {
    if (!form.mediaFileId || !selectedMedia) return;
    try {
      const results = await api<SelectableEpisodeMedia[]>(`/admin/media/selectable?search=${encodeURIComponent(selectedMedia.originalName)}`);
      const refreshed = results.find((item) => item.id === form.mediaFileId);
      if (refreshed) setSelectedMedia(refreshed);
    } catch {
      // El error original de guardado es el que debe conservarse para el administrador.
    }
  }

  function changeSource(videoSource: VideoSource) {
    setFormDirty(true);
    setForm((current) => ({
      ...current,
      playbackMode: videoSource === "HLS" ? "HLS" : "ORIGINAL",
      videoSource,
      videoType: videoTypeForSource(videoSource),
      processingJobStatus: "URL",
      videoUrl: "",
      originalVideoUrl: "",
      remuxedVideoUrl: "",
      processedVideoUrl: "",
    }));
    setErrors((current) => clearEpisodeErrors(current, "videoUrl"));
  }
  function changeVideoMode(videoMode: EpisodeVideoMode) {
    setFormDirty(true);
    setSelectedMedia(null);
    setForm((current) => ({
      ...current,
      videoMode,
      playbackMode: "ORIGINAL",
      processingJobId: "",
      mediaFileId: "",
      processingJobStatus: videoMode === "URL" ? "URL" : "NONE",
      videoUrl: "",
      originalVideoUrl: "",
      remuxedVideoUrl: "",
      processedVideoUrl: "",
      published: videoMode === "NONE" || videoMode === "UPLOAD" || videoMode === "AVAILABLE" ? false : current.published,
    }));
    setErrors((current) => clearEpisodeErrors(current, "videoUrl", "published"));
  }
  const selectMedia = useCallback((media: SelectableEpisodeMedia) => {
    setFormDirty(true);
    setSelectedMedia(media);
    setForm((current) => {
      const playbackMode: EpisodePlaybackMode = current.mediaFileId === media.id ? current.playbackMode : media.directPlaybackCompatible ? "ORIGINAL" : media.remuxUrl ? "REMUX" : media.hlsUrl ? "HLS" : "ORIGINAL";
      const videoUrl = playbackMode === "HLS" ? (media.hlsUrl ?? "") : playbackMode === "REMUX" ? (media.remuxUrl ?? "") : media.directPlaybackCompatible ? (media.originalUrl ?? "") : "";
      return {
        ...current,
        videoMode: "AVAILABLE",
        mediaFileId: media.id,
        processingJobId: "",
        processingJobStatus: media.status === "READY" ? "COMPLETED" : media.status === "PROCESSING" ? "PROCESSING" : media.status === "QUEUED" ? "QUEUED" : media.status === "FAILED" ? "FAILED" : "NONE",
        playbackMode,
        videoUrl,
        originalVideoUrl: media.originalUrl ?? "",
        remuxedVideoUrl: media.remuxUrl ?? "",
        processedVideoUrl: media.hlsUrl ?? "",
        videoSource: playbackMode === "HLS" ? "HLS" : "LOCAL",
        videoType: playbackMode === "HLS" ? "HLS" : "MP4",
        thumbnailUrl: current.thumbnailUrl || media.thumbnailUrl || "",
        durationSec: current.durationSec || (media.durationSec ? String(Math.round(media.durationSec)) : ""),
        published: videoUrl ? current.published : false,
      };
    });
    setErrors((current) => clearEpisodeErrors(current, "videoUrl", "published"));
  }, []);
  async function transcodeNow() {
    if (!form.mediaFileId || versionAction) return;
    setVersionAction("HLS");
    try {
      const job = await postJson<import("../../lib/resumable-upload").VideoProcessingJob>(`/admin/media/${encodeURIComponent(form.mediaFileId)}/transcode`, editingId ? { targetType: "EPISODE", targetId: editingId } : {});
      processing.track(job);
      setForm((current) => ({
        ...current,
        processingJobId: job.id,
        processingJobStatus: job.status,
      }));
      setSelectedMedia((current) =>
        current
          ? {
              ...current,
              status: job.status === "COMPLETED" ? "READY" : job.status === "PROCESSING" ? "PROCESSING" : job.status === "QUEUED" ? "QUEUED" : current.status,
              progress: job.progress,
              processingJobId: job.id,
              hlsUrl: job.masterUrl ?? current.hlsUrl,
            }
          : current,
      );
      toast.success(job.status === "COMPLETED" ? "El video ya estaba transcodificado" : "Video enviado a la cola de transcodificacion");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setVersionAction(null);
    }
  }
  async function remuxNow() {
    if (!form.mediaFileId || versionAction) return;
    setVersionAction("REMUX");
    try {
      const job = await postJson<import("../../lib/resumable-upload").VideoProcessingJob>(`/admin/media/${encodeURIComponent(form.mediaFileId)}/remux`, editingId ? { targetType: "EPISODE", targetId: editingId } : {});
      processing.track(job);
      setSelectedMedia((current) =>
        current
          ? {
              ...current,
              remuxStatus: job.status === "COMPLETED" ? "READY" : job.status === "CANCELLED" ? "FAILED" : job.status,
              remuxProgress: job.progress,
              remuxJobId: job.id,
              remuxUrl: job.outputUrl ?? current.remuxUrl,
            }
          : current,
      );
      toast.success(job.status === "COMPLETED" ? "El MP4 remux ya estaba disponible" : "Remux enviado a la cola");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setVersionAction(null);
    }
  }
  function changePlaybackMode(playbackMode: EpisodePlaybackMode) {
    if (!selectedMedia) return;
    setFormDirty(true);
    const videoUrl = playbackMode === "HLS" ? (selectedMedia.hlsUrl ?? "") : playbackMode === "REMUX" ? (selectedMedia.remuxUrl ?? "") : selectedMedia.directPlaybackCompatible ? (selectedMedia.originalUrl ?? "") : "";
    setForm((current) => ({
      ...current,
      playbackMode,
      videoUrl,
      videoSource: playbackMode === "HLS" ? "HLS" : "LOCAL",
      videoType: playbackMode === "HLS" ? "HLS" : "MP4",
      published: videoUrl ? current.published : false,
    }));
    setErrors((current) => clearEpisodeErrors(current, "videoUrl", "published"));
  }
  function handlePublishedChange(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.currentTarget.checked;
    setFormDirty(true);
    setForm((current) => withEpisodePublished(current, checked));
    setErrors((current) => clearEpisodeErrors(current, "published"));
  }
  function updateFormField<K extends keyof EpisodeForm>(field: K, value: EpisodeForm[K]) {
    setFormDirty(true);
    setForm((current) => withEpisodeFormField(current, field, value));
    setErrors((current) => clearEpisodeErrors(current, field));
  }
  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }
  async function removeEpisode() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteJson(`/admin/episodes/${pendingDelete.id}`);
      setPendingDelete(null);
      refresh();
      toast.success("Episodio eliminado");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  async function changePublished(item: Episode) {
    setChangingId(item.id);
    try {
      await patchJson("/admin/episodes/publish", {
        ids: [item.id],
        published: !item.published,
      });
      toast.success(item.published ? "Episodio despublicado" : "Episodio publicado");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChangingId(null);
    }
  }

  const totalPages = episodePageCount(episodes.data?.total ?? 0, limit);

  return (
    <Panel
      title="Episodios"
      description="Gestiona numeracion, video, miniaturas y marcadores de reproduccion."
      action={
        <button type="button" className="button-primary" disabled={!seasonId} onClick={() => createEpisode()}>
          Crear episodio
        </button>
      }
    >
      <ResourceError message={series.error ?? seasons.error ?? episodes.error ?? gaps.error} />
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <FormField>
          <FormLabel htmlFor="episode-series" required>
            Serie
          </FormLabel>
          <Select
            id="episode-series"
            value={seriesId}
            {...fieldA11y("episode-series", undefined, errors.seriesId)}
            onChange={(event) => {
              setSeriesId(event.target.value);
              setSeasonId("");
              setSelected([]);
              if (!formOpen) reset();
              else
                setErrors((current) => ({
                  ...current,
                  seriesId: "",
                  seasonId: "",
                }));
            }}
          >
            <option value="">Selecciona una serie</option>
            {(series.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
          <FormError id="episode-series-error">{errors.seriesId}</FormError>
        </FormField>
        <FormField>
          <FormLabel htmlFor="episode-season" required>
            Temporada
          </FormLabel>
          <Select
            id="episode-season"
            value={seasonId}
            {...fieldA11y("episode-season", undefined, errors.seasonId)}
            onChange={(event) => {
              setSeasonId(event.target.value);
              setSelected([]);
              if (!formOpen) reset();
              else setErrors((current) => ({ ...current, seasonId: "" }));
            }}
          >
            <option value="">Selecciona una temporada</option>
            {(seasons.data ?? []).map((season) => (
              <option key={season.id} value={season.id}>
                Temporada {season.number}: {season.title}
              </option>
            ))}
          </Select>
          <FormError id="episode-season-error">{errors.seasonId}</FormError>
        </FormField>
      </div>
      <form
        className="mb-5 grid gap-3 rounded-xl border border-line bg-ink/30 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput);
          setSelected([]);
        }}
      >
        <FormField>
          <FormLabel htmlFor="episode-search">Buscar</FormLabel>
          <TextInput id="episode-search" placeholder="Titulo o numero" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} />
        </FormField>
        <FormField>
          <FormLabel htmlFor="episode-published-filter">Publicacion</FormLabel>
          <Select
            id="episode-published-filter"
            value={publishedFilter}
            onChange={(event) => {
              setPublishedFilter(event.currentTarget.value as EpisodePublishedFilter);
              setPage(1);
              setSelected([]);
            }}
          >
            <option value="ALL">Todos</option>
            <option value="PUBLISHED">Publicados</option>
            <option value="DRAFT">Borradores</option>
          </Select>
        </FormField>
        <FormField>
          <FormLabel htmlFor="episode-video-filter">Video</FormLabel>
          <Select
            id="episode-video-filter"
            value={videoFilter}
            onChange={(event) => {
              setVideoFilter(event.currentTarget.value as EpisodeVideoFilter);
              setPage(1);
              setSelected([]);
            }}
          >
            <option value="ALL">Todos</option>
            <option value="READY">Listo</option>
            <option value="MISSING">Sin video</option>
          </Select>
        </FormField>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Buscar
          </Button>
        </div>
      </form>
      {seasonId && gaps.data?.missing.length ? (
        <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
          <AlertTriangle className="shrink-0 text-warning" />
          <p className="flex-1 text-slate-200">
            <strong>Faltan los episodios:</strong> {gaps.data.missing.join(", ")}
          </p>
          <button type="button" className="button-secondary" onClick={() => createEpisode(String(gaps.data?.missing[0] ?? ""))}>
            Crear el siguiente
          </button>
        </div>
      ) : (
        seasonId && <div className="mb-5 rounded-xl border border-mint/30 bg-mint/5 p-3 text-sm text-mint">Numeracion completa hasta el episodio {gaps.data?.max ?? 0}.</div>
      )}
      {formOpen && (
        <FormDisclosure open title="Episodio" heading={editingId ? "Editar episodio" : "Datos del episodio"} description="El formulario esta dividido para reducir errores y desplazamiento." editing={Boolean(editingId)} onToggle={reset}>
          {editorLoad.status === "loading" && (
            <div role="status" className="rounded-xl border border-line bg-ink/40 p-6 text-sm text-slate-300">
              Cargando datos del episodio...
            </div>
          )}
          {editorLoad.status === "error" && (
            <div role="alert" className="rounded-xl border border-coral/40 bg-coral/10 p-5">
              <p className="font-semibold text-coral">No se pudo abrir el editor del episodio.</p>
              <p className="mt-2 text-sm text-slate-300">{editorLoad.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="button-secondary" onClick={reset}>
                  Volver al listado
                </button>
                {editorLoad.episodeId && (
                  <Button
                    type="button"
                    onClick={() => {
                      if (editorLoad.episodeId) void edit(editorLoad.episodeId);
                    }}
                  >
                    Reintentar
                  </Button>
                )}
              </div>
            </div>
          )}
          {editorLoad.status === "ready" && (
            <form onSubmit={submit} className="grid gap-5">
              <FormSection title="Informacion basica">
                <FormField>
                  <FormLabel htmlFor="episode-number" required>
                    Numero
                  </FormLabel>
                  <NumberInput id="episode-number" min={1} value={form.number} {...fieldA11y("episode-number", undefined, errors.number)} onChange={(event) => updateFormField("number", event.currentTarget.value)} />
                  <FormError id="episode-number-error">{errors.number}</FormError>
                </FormField>
                <FormField>
                  <FormLabel htmlFor="episode-position">Posicion</FormLabel>
                  <NumberInput id="episode-position" min={0} value={form.position} {...fieldA11y("episode-position", undefined, errors.position)} onChange={(event) => updateFormField("position", event.currentTarget.value)} />
                  <FormHint>Se asigna automaticamente si se deja vacio.</FormHint>
                  <FormError id="episode-position-error">{errors.position}</FormError>
                </FormField>
                <FormField>
                  <FormLabel htmlFor="episode-title" required>
                    Titulo
                  </FormLabel>
                  <TextInput id="episode-title" value={form.title} {...fieldA11y("episode-title", undefined, errors.title)} onChange={(event) => updateFormField("title", event.currentTarget.value)} />
                  <FormError id="episode-title-error">{errors.title}</FormError>
                </FormField>
                <FormField>
                  <FormLabel htmlFor="episode-duration">Duracion en segundos</FormLabel>
                  <NumberInput id="episode-duration" min={0} value={form.durationSec} {...fieldA11y("episode-duration", undefined, errors.durationSec)} onChange={(event) => updateFormField("durationSec", event.currentTarget.value)} />
                  <FormError id="episode-duration-error">{errors.durationSec}</FormError>
                </FormField>
                <FormField>
                  <FormLabel htmlFor="episode-date">Fecha de publicacion</FormLabel>
                  <DateInput id="episode-date" value={form.publishedAt} {...fieldA11y("episode-date", undefined, errors.publishedAt)} onInput={(event) => updateFormField("publishedAt", event.currentTarget.value)} />
                  <FormError id="episode-date-error">{errors.publishedAt}</FormError>
                </FormField>
                <FormField>
                  <Checkbox label="Episodio publicado" checked={form.published} disabled={Boolean(form.processingJobId && !form.videoUrl)} onChange={handlePublishedChange} />
                  <FormError>{errors.published}</FormError>
                  {form.processingJobId && !form.videoUrl && <FormHint>Se guarda como borrador hasta que el video HLS este listo.</FormHint>}
                </FormField>
                <FormField fullWidth>
                  <FormLabel htmlFor="episode-description">Descripcion</FormLabel>
                  <TextArea id="episode-description" value={form.description} onChange={(event) => updateFormField("description", event.currentTarget.value)} />
                </FormField>
              </FormSection>
              <FormSection title="Miniatura">
                <FormField>
                  <FormLabel htmlFor="episode-thumbnail">Miniatura URL</FormLabel>
                  <TextInput id="episode-thumbnail" placeholder="https://... o /uploads/..." value={form.thumbnailUrl} onChange={(event) => updateFormField("thumbnailUrl", event.currentTarget.value)} />
                </FormField>
                <UploadField type="image" label="Subir miniatura" onUploaded={(thumbnailUrl) => updateFormField("thumbnailUrl", thumbnailUrl)} />
                {form.thumbnailUrl && (
                  <div className="md:col-span-2">
                    <SmartImage src={form.thumbnailUrl} alt="Vista previa de la miniatura" className="aspect-video w-full max-w-sm rounded-xl border border-line object-cover" />
                  </div>
                )}
              </FormSection>
              <FormSection title="Video del episodio">
                <FormField>
                  <FormLabel htmlFor="episode-video-mode" required>
                    Origen
                  </FormLabel>
                  <Select id="episode-video-mode" value={form.videoMode} onChange={(event) => changeVideoMode(event.target.value as EpisodeVideoMode)}>
                    <option value="UPLOAD">Subir un video nuevo</option>
                    <option value="AVAILABLE">Usar archivo cargado</option>
                    <option value="URL">Usar URL externa</option>
                    <option value="NONE">Crear episodio sin video</option>
                  </Select>
                </FormField>
                {form.videoMode === "URL" && (
                  <FormField>
                    <FormLabel htmlFor="episode-source" required>
                      Fuente
                    </FormLabel>
                    <Select id="episode-source" value={form.videoSource} onChange={(event) => changeSource(event.target.value as VideoSource)}>
                      <option value="URL">MP4 externa</option>
                      <option value="HLS">HLS .m3u8</option>
                      <option value="DRIVE">Google Drive</option>
                      <option value="EMBED">Embed permitido</option>
                    </Select>
                  </FormField>
                )}
                {form.videoMode === "URL" && (
                  <FormField fullWidth>
                    <FormLabel htmlFor="episode-video-url" required>
                      URL del video
                    </FormLabel>
                    <TextInput
                      id="episode-video-url"
                      placeholder="https://... o /uploads/..."
                      value={form.originalVideoUrl}
                      {...fieldA11y("episode-video-url", undefined, errors.videoUrl)}
                      onChange={(event) => {
                        const videoUrl = event.currentTarget.value;
                        setFormDirty(true);
                        setForm((current) => ({
                          ...current,
                          originalVideoUrl: videoUrl,
                          videoUrl,
                          processedVideoUrl: "",
                        }));
                      }}
                    />
                    <FormError id="episode-video-url-error">{errors.videoUrl}</FormError>
                  </FormField>
                )}
                {form.videoMode === "UPLOAD" && (
                  <FormField fullWidth>
                    <UploadField
                      type="video"
                      label={`Subir video MP4, MKV, MOV o WebM (${Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 2048)} MB)`}
                      selectedProcessingJobId={form.processingJobId}
                      onProcessingJob={(job) => {
                        setFormDirty(true);
                        setSelectedMedia(null);
                        setForm((current) => ({
                          ...current,
                          playbackMode: job.kind === "REMUX" ? "REMUX" : "HLS",
                          mediaFileId: "",
                          processingJobId: job.id,
                          processingJobStatus: job.status,
                          videoUrl: "",
                          originalVideoUrl: "",
                          remuxedVideoUrl: "",
                          processedVideoUrl: "",
                          published: false,
                        }));
                        refresh();
                      }}
                      onUploaded={(url, mimeType, details) => {
                        setFormDirty(true);
                        const hls = mimeType.includes("mpegurl");
                        const remux = details?.processingMode === "REMUX";
                        const originalUrl = details?.originalUrl ?? url;
                        const direct = Boolean(details?.directlyPlayable);
                        const playbackMode: EpisodePlaybackMode = hls ? "HLS" : remux ? "REMUX" : "ORIGINAL";
                        const videoUrl = hls || remux ? url : direct ? originalUrl : "";
                        setForm((current) => ({
                          ...current,
                          videoMode: details?.mediaFileId ? "AVAILABLE" : current.videoMode,
                          mediaFileId: details?.mediaFileId ?? current.mediaFileId,
                          processingJobId: "",
                          processingJobStatus: details?.processingJobId ? "COMPLETED" : "NONE",
                          playbackMode,
                          videoUrl,
                          originalVideoUrl: originalUrl,
                          remuxedVideoUrl: remux ? url : "",
                          processedVideoUrl: hls ? url : "",
                          thumbnailUrl: current.thumbnailUrl || details?.thumbnailUrl || "",
                          videoType: hls ? "HLS" : "MP4",
                          videoSource: hls ? "HLS" : "LOCAL",
                        }));
                        if (details?.mediaFileId)
                          setSelectedMedia({
                            id: details.mediaFileId,
                            originalName: "Video recien cargado",
                            sizeBytes: "0",
                            durationSec: details.durationSec ?? null,
                            width: details.width ?? null,
                            height: details.height ?? null,
                            videoCodec: details.videoCodec ?? null,
                            audioCodec: details.audioCodec ?? null,
                            mimeType,
                            extension: mimeType.includes("matroska") ? ".mkv" : ".mp4",
                            status: hls ? "READY" : "ORIGINAL",
                            progress: hls ? 100 : null,
                            processingJobId: hls ? (details.processingJobId ?? null) : null,
                            processingError: null,
                            originalUrl,
                            remuxUrl: remux ? url : null,
                            remuxJobId: remux ? (details.processingJobId ?? null) : null,
                            remuxStatus: remux ? "READY" : "NONE",
                            remuxProgress: remux ? 100 : null,
                            remuxError: null,
                            hlsUrl: hls ? url : null,
                            playbackUrl: videoUrl || null,
                            directPlaybackCompatible: direct && !remux,
                            compatibilityMessage: details.compatibilityMessage ?? (direct ? "Compatible para reproduccion directa." : "Puede requerir transcodificacion para navegadores."),
                            fastStart: details.fastStart ?? null,
                            thumbnailUrl: details.thumbnailUrl ?? null,
                            createdAt: new Date().toISOString(),
                          });
                      }}
                    />
                    <FormError>{errors.videoUrl}</FormError>
                  </FormField>
                )}
                {form.videoMode === "AVAILABLE" && (
                  <FormField fullWidth>
                    <EpisodeMediaSelector selectedId={form.mediaFileId} revision={revision} onSelect={selectMedia} />
                    <FormError>{errors.videoUrl}</FormError>
                  </FormField>
                )}
                {form.videoMode === "NONE" && <div className="md:col-span-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-slate-300">El episodio se guardara como borrador. Puedes vincular un video mas adelante.</div>}
                {activeProcessingJob && <div role="status" className="md:col-span-2 rounded-xl border border-mint/30 bg-mint/5 p-3 text-sm text-mint">{backgroundProcessingMessage(activeProcessingJob)} Puedes guardar ahora; el trabajo continuara en segundo plano.</div>}
                {selectedMedia && selectedVersions && (
                  <div className="md:col-span-2 rounded-xl border border-line bg-ink/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Video asociado</p>
                    <p className="mt-2 font-medium text-white">{selectedMedia.originalName}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {selectedMedia.width && selectedMedia.height ? `${selectedMedia.width}x${selectedMedia.height}` : "Resolucion no disponible"} · Video: {codecLabel(selectedMedia.videoCodec)} · Audio: {codecLabel(selectedMedia.audioCodec)} · Duracion: {durationLabel(selectedMedia.durationSec)}
                    </p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Versiones</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {Object.values(selectedVersions).map((version) => <div key={version.kind} className="rounded-lg border border-line bg-panel/50 p-3">
                        <p className="font-semibold text-white">{version.status === "AVAILABLE" ? "✓" : version.status === "MISSING" || version.status === "FAILED" ? "!" : version.status === "PROCESSING" || version.status === "QUEUED" ? "⏳" : "—"} {version.title} <span className="text-xs text-slate-500">{version.format}</span></p>
                        <p className={`mt-1 text-xs ${version.status === "AVAILABLE" ? "text-mint" : version.status === "FAILED" || version.status === "MISSING" ? "text-coral" : "text-slate-400"}`}>{version.label}{version.kind === "REMUX" && version.available ? " · Recomendado para web" : ""}</p>
                      </div>)}
                    </div>
                    <p className={`mt-3 text-xs ${selectedMedia.directPlaybackCompatible || selectedVersions.REMUX.available ? "text-mint" : "text-warning"}`}>{mediaCompatibilityMessage({ ...selectedMedia, hlsStatus: selectedMedia.status })}</p>
                    <fieldset className="mt-4 grid gap-2 rounded-lg border border-line p-3">
                      <legend className="px-1 text-xs font-semibold text-slate-200">Fuente de reproduccion a guardar</legend>
                      <label className="flex items-start gap-2 text-sm text-slate-300">
                        <input type="radio" name="episode-playback-mode" disabled={!selectedMedia.directPlaybackCompatible || !selectedVersions.ORIGINAL.available} checked={form.playbackMode === "ORIGINAL"} onChange={() => changePlaybackMode("ORIGINAL")} />
                        <span>
                          <strong className="block text-white">Usar archivo original</strong>
                          {selectedVersions.ORIGINAL.status === "MISSING" ? "Archivo faltante." : selectedMedia.directPlaybackCompatible ? "Compatible para reproduccion directa." : `${selectedVersions.ORIGINAL.format} · compatibilidad web limitada.`}
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-300">
                        <input type="radio" name="episode-playback-mode" disabled={!selectedVersions.REMUX.available} checked={form.playbackMode === "REMUX"} onChange={() => changePlaybackMode("REMUX")} />
                        <span>
                          <strong className="block text-white">Usar MP4 remux</strong>
                          {selectedVersions.REMUX.available ? "MP4 compatible disponible." : selectedVersions.REMUX.label}
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-300">
                        <input type="radio" name="episode-playback-mode" disabled={!selectedVersions.HLS.available} checked={form.playbackMode === "HLS"} onChange={() => changePlaybackMode("HLS")} />
                        <span>
                          <strong className="block text-white">Usar HLS transcodificado</strong>
                          {selectedVersions.HLS.available ? "Streaming adaptativo disponible." : selectedVersions.HLS.label}
                        </span>
                      </label>
                      {persistedPlaybackMode && <p className="text-xs text-slate-400">Fuente guardada actualmente: {playbackModeLabel(persistedPlaybackMode)}</p>}
                      <p className="text-xs font-semibold text-brand">{persistedPlaybackMode && persistedPlaybackMode !== form.playbackMode ? "Nueva fuente seleccionada" : persistedPlaybackMode ? "Fuente seleccionada" : "Fuente seleccionada para guardar"}: {playbackModeLabel(form.playbackMode)}</p>
                    </fieldset>
                    {selectedMedia.processingError && <p className="mt-2 text-xs text-coral">{selectedMedia.processingError}</p>}
                    {selectedMedia.remuxError && <p className="mt-2 text-xs text-coral">{selectedMedia.remuxError}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!["QUEUED", "PROCESSING"].includes(selectedMedia.remuxStatus) && !selectedVersions.REMUX.available && (
                        <button type="button" className="button-secondary" disabled={Boolean(versionAction)} onClick={() => void remuxNow()}>
                          {versionAction === "REMUX" ? "Enviando remux..." : selectedMedia.remuxStatus === "FAILED" ? "Reintentar remux" : "Crear MP4 compatible"}
                        </button>
                      )}
                      {!["QUEUED", "PROCESSING"].includes(selectedMedia.status) && !selectedVersions.HLS.available && (
                        <button type="button" className="button-secondary" disabled={Boolean(versionAction)} onClick={() => void transcodeNow()}>
                          {versionAction === "HLS" ? "Enviando HLS..." : selectedMedia.status === "FAILED" ? "Reintentar HLS" : "Generar HLS"}
                        </button>
                      )}
                      <button type="button" className="button-secondary" onClick={() => changeVideoMode("UPLOAD")}>
                        Cambiar video
                      </button>
                      <button type="button" className="rounded-lg border border-coral px-3 py-2 text-sm text-coral" onClick={() => changeVideoMode("NONE")}>
                        Desvincular video
                      </button>
                    </div>
                  </div>
                )}
              </FormSection>
              <details className="group rounded-2xl border border-line bg-ink/25">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-white sm:px-5">
                  <Settings2 size={18} className="text-brand" />
                  Configuracion avanzada de reproduccion
                  <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Mostrar</span>
                </summary>
                <div className="grid gap-4 border-t border-line p-4 md:grid-cols-2 sm:p-5">
                  {(
                    [
                      ["introStartSec", "Inicio de introduccion"],
                      ["introEndSec", "Fin de introduccion"],
                      ["recapStartSec", "Inicio de resumen"],
                      ["recapEndSec", "Fin de resumen"],
                    ] as const
                  ).map(([key, label]) => (
                    <FormField key={key}>
                      <FormLabel htmlFor={`episode-${key}`}>{label} (segundos)</FormLabel>
                      <NumberInput id={`episode-${key}`} min={0} value={form[key]} {...fieldA11y(`episode-${key}`, undefined, errors[key])} onChange={(event) => updateFormField(key, event.currentTarget.value)} />
                      <FormError id={`episode-${key}-error`}>{errors[key]}</FormError>
                    </FormField>
                  ))}
                </div>
              </details>
              <FormActions>
                {formDirty && <p className="mr-auto text-sm text-warning">Hay cambios sin guardar.</p>}
                <button type="button" className="button-secondary" disabled={saving} onClick={reset}>
                  Cancelar
                </button>
                <Button disabled={!seasonId || saving}>{saving ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar episodio"}</Button>
              </FormActions>
            </form>
          )}
        </FormDisclosure>
      )}
      <BulkEpisodeTools
        seriesId={seriesId}
        seasonId={seasonId}
        episodes={items}
        selected={selected}
        onSelected={setSelected}
        onChanged={handleBulkChanged}
      />
      <div className="admin-table-shell" role="region" aria-label="Episodios de la temporada" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>
                <input type="checkbox" aria-label="Seleccionar todos" checked={items.length > 0 && items.every((item) => selected.includes(item.id))} onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])} />
              </th>
              <th>Serie</th>
              <th>Temporada</th>
              <th>Numero</th>
              <th>Orden</th>
              <th>Titulo</th>
              <th>Video</th>
              <th>Procesamiento</th>
              <th>Publicacion</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-10 text-center">
                  <p className="font-medium text-slate-200">No se encontraron episodios</p>
                  <p className="mt-1 text-sm text-slate-400">Ajusta los filtros, crea el primer episodio o importa un archivo CSV.</p>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input type="checkbox" aria-label={`Seleccionar ${item.title}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                  </td>
                  <td>{item.series?.title ?? "-"}</td>
                  <td>{item.season?.number ?? "-"}</td>
                  <td>{item.number}</td>
                  <td>{item.position}</td>
                  <td className="max-w-xs truncate">{item.title}</td>
                  <td>
                    <span className="block">{item.mediaFile?.originalName ?? (item.videoUrl ? "URL de video" : "Sin archivo")}</span>
                    <span className="block text-xs text-slate-400">Fuente: {item.mediaFileId || item.videoUrl ? `${playbackModeLabel(item.playbackMode ?? "ORIGINAL")}${item.videoUrl ? "" : " (no disponible)"}` : "Sin video"}</span>
                  </td>
                  <td>{episodeProcessingLabel(item)}</td>
                  <td>{item.published ? (item.playbackMode === "HLS" ? "Publicado con HLS" : item.playbackMode === "REMUX" ? "Publicado con MP4 remux" : "Publicado con original") : "Borrador"}</td>
                  <td>
                    <div className="flex min-w-max flex-wrap gap-2">
                      <button type="button" className="rounded-lg border border-brand px-3 py-1.5 text-brand disabled:opacity-50" disabled={Boolean(changingId) || deleting} onClick={() => void edit(item.id)}>
                        Editar
                      </button>
                      <button type="button" className="rounded-lg border border-mint px-3 py-1.5 text-mint disabled:opacity-50" disabled={Boolean(changingId) || deleting} onClick={() => void changePublished(item)}>
                        {changingId === item.id ? "Procesando..." : item.published ? "Despublicar" : "Publicar"}
                      </button>
                      <Link className="rounded-lg border border-line px-3 py-1.5 text-slate-200" to={`/admin/subtitles?episodeId=${encodeURIComponent(item.id)}`}>
                        Subtitulos
                      </Link>
                      {item.processingJob && (
                        <Link className="rounded-lg border border-line px-3 py-1.5 text-slate-200" to="/admin/processing">
                          Procesamiento
                        </Link>
                      )}
                      <button type="button" className="rounded-lg border border-coral px-3 py-1.5 text-coral disabled:opacity-50" disabled={Boolean(changingId) || deleting} onClick={() => setPendingDelete(item)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mb-6 mt-3 flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {episodes.data?.total ?? 0} episodios · Pagina {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="button-secondary"
            disabled={page <= 1}
            onClick={() => {
              setPage((value) => Math.max(1, value - 1));
              setSelected([]);
            }}
          >
            Anterior
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={page >= totalPages}
            onClick={() => {
              setPage((value) => Math.min(totalPages, value + 1));
              setSelected([]);
            }}
          >
            Siguiente
          </button>
        </div>
      </div>
      <CsvEpisodeImport seriesId={seriesId} onImported={refresh} />
      <ConfirmDialog open={Boolean(pendingDelete)} title="Eliminar episodio" itemName={pendingDelete ? episodeDeleteLabel(pendingDelete) : undefined} description="El episodio se retirara del catalogo. Los archivos de video, HLS y subtitulos se conservaran en la biblioteca multimedia." busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void removeEpisode()} />
    </Panel>
  );
}

function mediaFromEpisode(episode: EpisodeEditorSource): SelectableEpisodeMedia | null {
  const media = episode.mediaFile;
  if (!media || !episode.mediaFileId) return null;
  const job = episode.processingJob;
  const directPlaybackCompatible = media.extension.toLowerCase() === ".mp4" && ["h264", "avc1"].includes(media.videoCodec?.toLowerCase() ?? "") && (!media.audioCodec || ["aac", "mp3"].includes(media.audioCodec.toLowerCase()));
  const hlsUrl = episode.processedVideoUrl || job?.masterUrl || null;
  const remuxUrl = episode.remuxedVideoUrl || (job?.kind === "REMUX" ? job.outputUrl : null) || null;
  const jobStatus: SelectableEpisodeMedia["status"] = job?.status === "QUEUED" ? "QUEUED" : job?.status === "PROCESSING" ? "PROCESSING" : job?.status === "FAILED" || job?.status === "CANCELLED" ? "FAILED" : job?.status === "COMPLETED" ? "READY" : "ORIGINAL";
  const status: SelectableEpisodeMedia["status"] = job?.kind === "HLS" ? jobStatus : hlsUrl ? "READY" : "ORIGINAL";
  const playbackUrl = episode.playbackMode === "HLS" ? hlsUrl : episode.playbackMode === "REMUX" ? remuxUrl : directPlaybackCompatible ? episode.originalVideoUrl || episode.videoUrl || null : null;
  return {
    id: episode.mediaFileId,
    originalName: media.originalName,
    sizeBytes: String(media.sizeBytes),
    durationSec: media.durationSec ?? episode.durationSec ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
    videoCodec: media.videoCodec ?? null,
    audioCodec: media.audioCodec ?? null,
    mimeType: media.mimeType,
    extension: media.extension,
    status,
    progress: job?.kind === "HLS" ? job.progress : hlsUrl ? 100 : null,
    processingJobId: job?.kind === "HLS" ? job.id : null,
    processingError: job?.kind === "HLS" ? (job.errorMessage ?? null) : null,
    originalUrl: episode.originalVideoUrl || "",
    remuxUrl,
    remuxJobId: job?.kind === "REMUX" ? job.id : null,
    remuxStatus: job?.kind === "REMUX" ? (jobStatus === "ORIGINAL" ? "NONE" : jobStatus) : remuxUrl ? "READY" : "NONE",
    remuxProgress: job?.kind === "REMUX" ? job.progress : remuxUrl ? 100 : null,
    remuxError: job?.kind === "REMUX" ? (job.errorMessage ?? null) : null,
    hlsUrl,
    playbackUrl,
    directPlaybackCompatible,
    compatibilityMessage: mediaCompatibilityMessage({ extension: media.extension, originalUrl: episode.originalVideoUrl, remuxUrl, hlsUrl, hlsStatus: status, remuxStatus: job?.kind === "REMUX" ? jobStatus : remuxUrl ? "READY" : "NONE", directPlaybackCompatible }),
    fastStart: null,
    thumbnailUrl: episode.thumbnailUrl || null,
    createdAt: media.createdAt,
  };
}

function playbackUrlFor(form: EpisodeForm, media: SelectableEpisodeMedia | null) {
  if (form.videoMode === "URL") return form.videoUrl;
  if (!media) return form.videoUrl;
  return form.playbackMode === "HLS" ? media.hlsUrl || form.processedVideoUrl || "" : form.playbackMode === "REMUX" ? media.remuxUrl || form.remuxedVideoUrl || "" : media.directPlaybackCompatible ? media.originalUrl || form.originalVideoUrl || "" : "";
}

function formWithRuntimeMedia(form: EpisodeForm, media: SelectableEpisodeMedia | null): EpisodeForm {
  if (form.videoMode !== "AVAILABLE" || !media) return form;
  const videoUrl = playbackUrlFor(form, media);
  const originalVideoUrl = media.originalUrl || form.originalVideoUrl;
  const remuxedVideoUrl = media.remuxUrl || form.remuxedVideoUrl;
  const processedVideoUrl = media.hlsUrl || form.processedVideoUrl;
  const videoSource: VideoSource = form.playbackMode === "HLS" ? "HLS" : "LOCAL";
  const videoType: VideoType = form.playbackMode === "HLS" ? "HLS" : "MP4";
  if (form.videoUrl === videoUrl && form.originalVideoUrl === originalVideoUrl && form.remuxedVideoUrl === remuxedVideoUrl && form.processedVideoUrl === processedVideoUrl && form.videoSource === videoSource && form.videoType === videoType) return form;
  return { ...form, videoUrl, originalVideoUrl, remuxedVideoUrl, processedVideoUrl, videoSource, videoType };
}

function clearEpisodeErrors<K extends PropertyKey>(current: Record<string, string>, ...fields: K[]) {
  if (!fields.some((field) => Boolean(current[String(field)]))) return current;
  const next = { ...current };
  for (const field of fields) next[String(field)] = "";
  return next;
}

function backgroundProcessingMessage(job: Pick<EpisodeProcessingJob, "kind" | "stage" | "status" | "progress">) {
  const kind = job.kind === "REMUX" ? "MP4 remux" : job.kind === "HLS" ? "HLS" : "Video";
  return `${kind}: ${processingStageLabel(job.stage, job.status)}${job.status === "PROCESSING" ? ` (${job.progress}%)` : ""}.`;
}

function playbackModeLabel(mode: EpisodePlaybackMode) {
  return mode === "ORIGINAL" ? "Archivo original" : mode === "REMUX" ? "MP4 remux" : "HLS transcodificado";
}

function codecLabel(codec: string | null) {
  if (!codec) return "No disponible";
  const normalized = codec.toLowerCase();
  if (normalized === "h264" || normalized === "avc1") return "H.264";
  if (normalized === "h265" || normalized === "hevc") return "H.265";
  if (normalized === "aac") return "AAC";
  return codec.toUpperCase();
}

function durationLabel(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "No disponible";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = String(rounded % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}` : `${minutes}:${remaining}`;
}
