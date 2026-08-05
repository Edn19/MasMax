import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, postJson } from './api';
import { useAuth } from './auth';
import { VideoProcessingJob } from './resumable-upload';
import { findProcessingJobForTarget, isActiveProcessingJob, mergeProcessingJobs, ProcessingJobRow } from './video-processing-state';

const trackedJobsKey = 'masmax:processing-job-ids';

type ProcessingJobsContextValue = {
  jobs: ProcessingJobRow[];
  activeJobs: ProcessingJobRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  track: (job: ProcessingJobRow | VideoProcessingJob) => void;
  cancel: (id: string) => Promise<ProcessingJobRow>;
  retry: (id: string) => Promise<ProcessingJobRow>;
  byTarget: (targetType?: 'EPISODE' | 'MOVIE', targetId?: string) => ProcessingJobRow | undefined;
};

const ProcessingJobsContext = createContext<ProcessingJobsContextValue | null>(null);

export function VideoProcessingJobsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<ProcessingJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);
  const isAdmin = !authLoading && user?.role === 'ADMIN';

  const refresh = useCallback(() => {
    if (!isAdmin) return Promise.resolve();
    if (requestRef.current) return requestRef.current;
    setLoading(true);
    const request = api<ProcessingJobRow[]>('/admin/video-processing/jobs')
      .then((nextJobs) => { setJobs(nextJobs); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los trabajos de video'))
      .finally(() => { requestRef.current = null; setLoading(false); });
    requestRef.current = request;
    return request;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) { setJobs([]); setError(null); return; }
    void refresh();
  }, [isAdmin, refresh]);

  const hasActiveJobs = jobs.some(isActiveProcessingJob);
  useEffect(() => {
    if (!isAdmin || !hasActiveJobs) return;
    let stopped = false;
    let timeout = 0;
    const poll = async () => {
      await refresh();
      if (!stopped) timeout = window.setTimeout(() => void poll(), 2500);
    };
    timeout = window.setTimeout(() => void poll(), 2500);
    return () => { stopped = true; window.clearTimeout(timeout); };
  }, [hasActiveJobs, isAdmin, refresh]);

  const track = useCallback((job: ProcessingJobRow | VideoProcessingJob) => {
    const row = job as ProcessingJobRow;
    setJobs((current) => mergeProcessingJobs(current, [row]));
    try {
      const stored = JSON.parse(localStorage.getItem(trackedJobsKey) ?? '[]') as unknown;
      const ids = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : [];
      localStorage.setItem(trackedJobsKey, JSON.stringify([...new Set([job.id, ...ids])].slice(0, 20)));
    } catch { localStorage.setItem(trackedJobsKey, JSON.stringify([job.id])); }
  }, []);

  const cancel = useCallback(async (id: string) => {
    const job = await postJson<ProcessingJobRow>(`/admin/video-processing/jobs/${encodeURIComponent(id)}/cancel`, {});
    track(job);
    return job;
  }, [track]);

  const retry = useCallback(async (id: string) => {
    const job = await postJson<ProcessingJobRow>(`/admin/video-processing/jobs/${encodeURIComponent(id)}/retry`, {});
    track(job);
    return job;
  }, [track]);

  const activeJobs = useMemo(() => jobs.filter(isActiveProcessingJob), [jobs]);
  const value = useMemo<ProcessingJobsContextValue>(() => ({ jobs, activeJobs, loading, error, refresh, track, cancel, retry, byTarget: (targetType, targetId) => findProcessingJobForTarget(jobs, targetType, targetId) }), [activeJobs, cancel, error, jobs, loading, refresh, retry, track]);
  return <ProcessingJobsContext.Provider value={value}>{children}</ProcessingJobsContext.Provider>;
}

export function useVideoProcessingJobs() {
  const context = useContext(ProcessingJobsContext);
  if (!context) throw new Error('useVideoProcessingJobs debe usarse dentro de VideoProcessingJobsProvider');
  return context;
}
