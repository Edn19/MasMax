import { BadRequestException } from '@nestjs/common';
import { VideoSource, VideoType } from '@prisma/client';

export type VideoInput = {
  videoUrl: string;
  videoSource: string;
  videoType: string;
  originalVideoUrl?: string | null;
  processedVideoUrl?: string | null;
};

export type NormalizedVideo = {
  videoUrl: string;
  originalVideoUrl: string;
  processedVideoUrl: string;
  videoSource: VideoSource;
  videoType: VideoType;
};

export function normalizeVideo(input: VideoInput): NormalizedVideo {
  const source = input.videoSource as VideoSource;
  const type = input.videoType as VideoType;
  const submittedUrl = (input.originalVideoUrl || input.videoUrl || '').trim();
  if (!submittedUrl) throw new BadRequestException('La URL del video es obligatoria');

  if (source === VideoSource.LOCAL) {
    if (type !== VideoType.MP4 || !/^\/uploads\/videos\/[^/]+\.mp4$/i.test(input.videoUrl)) {
      throw new BadRequestException('El video local debe ser un archivo MP4 valido');
    }
    return {
      videoUrl: input.videoUrl.trim(),
      originalVideoUrl: input.videoUrl.trim(),
      processedVideoUrl: input.videoUrl.trim(),
      videoSource: VideoSource.LOCAL,
      videoType: VideoType.MP4,
    };
  }

  if (source === VideoSource.DRIVE) {
    const fileId = extractDriveFileId(submittedUrl);
    const processed = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    return {
      videoUrl: processed,
      originalVideoUrl: submittedUrl,
      processedVideoUrl: processed,
      videoSource: VideoSource.DRIVE,
      videoType: VideoType.DRIVE,
    };
  }

  const parsed = parseSecureUrl(submittedUrl);
  if (source === VideoSource.HLS) {
    if (type !== VideoType.HLS || !parsed.pathname.toLowerCase().endsWith('.m3u8')) {
      throw new BadRequestException('La fuente HLS debe usar una URL HTTPS terminada en .m3u8');
    }
  } else if (source === VideoSource.URL) {
    if (type !== VideoType.MP4 || !parsed.pathname.toLowerCase().endsWith('.mp4')) {
      throw new BadRequestException('La URL externa debe ser HTTPS y terminar en .mp4');
    }
  } else if (source === VideoSource.EMBED) {
    if (type !== VideoType.EMBED || !isAllowedEmbedHost(parsed.hostname)) {
      throw new BadRequestException('El proveedor embed no esta permitido');
    }
  } else {
    throw new BadRequestException('La fuente de video no es valida');
  }

  return {
    videoUrl: submittedUrl,
    originalVideoUrl: submittedUrl,
    processedVideoUrl: submittedUrl,
    videoSource: source,
    videoType: type,
  };
}

function parseSecureUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException('La URL del video no es valida');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new BadRequestException('La URL externa debe iniciar con https://');
  }
  return parsed;
}

function extractDriveFileId(value: string) {
  const parsed = parseSecureUrl(value);
  if (!['drive.google.com', 'docs.google.com'].includes(parsed.hostname.toLowerCase())) {
    throw new BadRequestException('La URL debe pertenecer a Google Drive');
  }
  const pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const fileId = pathMatch?.[1] ?? parsed.searchParams.get('id');
  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    throw new BadRequestException('No se pudo detectar el FILE_ID de Google Drive');
  }
  return fileId;
}

function isAllowedEmbedHost(hostname: string) {
  const allowed = (process.env.ALLOWED_EMBED_DOMAINS ?? 'youtube.com,player.vimeo.com,drive.google.com')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const host = hostname.toLowerCase();
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
