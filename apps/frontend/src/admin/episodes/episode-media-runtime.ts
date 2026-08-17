import type { EpisodeProcessingJob } from "../../types/models";
import type { SelectableEpisodeMedia } from "./EpisodeMediaSelector";

type RuntimeProcessingJob = Pick<EpisodeProcessingJob, "status" | "progress" | "masterUrl" | "outputUrl" | "thumbnailUrl" | "errorMessage">;

export function applyHlsProcessingJob(current: SelectableEpisodeMedia, job: RuntimeProcessingJob): SelectableEpisodeMedia {
  const status: SelectableEpisodeMedia["status"] =
    job.status === "COMPLETED" ? "READY" : job.status === "CANCELLED" ? "FAILED" : job.status;
  const next = {
    status,
    progress: job.progress,
    processingError: job.errorMessage ?? null,
    hlsUrl: job.masterUrl ?? current.hlsUrl,
    playbackUrl: job.masterUrl ?? current.playbackUrl,
    thumbnailUrl: job.thumbnailUrl ?? current.thumbnailUrl,
  };
  if (
    current.status === next.status &&
    current.progress === next.progress &&
    current.processingError === next.processingError &&
    current.hlsUrl === next.hlsUrl &&
    current.playbackUrl === next.playbackUrl &&
    current.thumbnailUrl === next.thumbnailUrl
  ) return current;
  return { ...current, ...next };
}

export function applyRemuxProcessingJob(current: SelectableEpisodeMedia, job: RuntimeProcessingJob): SelectableEpisodeMedia {
  const remuxStatus: SelectableEpisodeMedia["remuxStatus"] =
    job.status === "COMPLETED" ? "READY" : job.status === "CANCELLED" ? "FAILED" : job.status;
  const next = {
    remuxStatus,
    remuxProgress: job.progress,
    remuxError: job.errorMessage ?? null,
    remuxUrl: job.outputUrl ?? current.remuxUrl,
  };
  if (
    current.remuxStatus === next.remuxStatus &&
    current.remuxProgress === next.remuxProgress &&
    current.remuxError === next.remuxError &&
    current.remuxUrl === next.remuxUrl
  ) return current;
  return { ...current, ...next };
}
