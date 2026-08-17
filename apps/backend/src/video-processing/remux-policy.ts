import { MediaProbeMetadata } from './media-probe';

export type RemuxPlan = {
  allowed: boolean;
  copyVideo: boolean;
  copyAudio: boolean;
  audioCodec: string | null;
  subtitlePolicy: 'OMIT';
  message: string;
};

export function planMp4Remux(metadata: MediaProbeMetadata): RemuxPlan {
  const copyVideo = ['h264', 'avc1'].includes(metadata.videoCodec);
  if (!copyVideo) {
    return {
      allowed: false,
      copyVideo: false,
      copyAudio: false,
      audioCodec: null,
      subtitlePolicy: 'OMIT',
      message: 'El video no es H.264; un remux requeriria recodificar video. Usa HLS.',
    };
  }
  const copyAudio = metadata.audioTracks.every((track) => track.codec === 'aac' && track.channels > 0 && track.channels <= 6);
  return {
    allowed: true,
    copyVideo: true,
    copyAudio,
    audioCodec: metadata.audioTracks.length ? 'aac' : null,
    subtitlePolicy: 'OMIT',
    message: copyAudio
      ? 'Se copiaran video H.264 y audio AAC sin recodificarlos.'
      : 'Se copiara el video H.264 y solo el audio se convertira a AAC.',
  };
}
