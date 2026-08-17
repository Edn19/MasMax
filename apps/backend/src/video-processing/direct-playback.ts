import { Prisma } from '@prisma/client';

type DirectPlaybackMedia = {
  extension: string;
  videoCodec: string | null;
  audioCodec: string | null;
  probeMetadata?: Prisma.JsonValue | null;
};

export type DirectPlaybackCompatibility = {
  compatible: boolean;
  fastStart: boolean | null;
  message: string;
};

export function directPlaybackCompatibility(media: DirectPlaybackMedia): DirectPlaybackCompatibility {
  const extension = media.extension?.toLowerCase() ?? '';
  const videoCodec = media.videoCodec?.toLowerCase() ?? '';
  const audioCodec = media.audioCodec?.toLowerCase() ?? '';
  const fastStart = probeFastStart(media.probeMetadata);
  const compatible = extension === '.mp4'
    && (videoCodec === 'h264' || videoCodec === 'avc1')
    && (!audioCodec || audioCodec === 'aac' || audioCodec === 'mp3');

  if (!compatible) {
    return {
      compatible: false,
      fastStart,
      message: 'El archivo fue guardado, pero su contenedor o codecs pueden no reproducirse en todos los navegadores. Se recomienda transcodificarlo.',
    };
  }
  if (fastStart === false) {
    return {
      compatible: true,
      fastStart,
      message: 'Compatible para reproduccion directa, aunque el MP4 no tiene inicio rapido y puede tardar mas en comenzar.',
    };
  }
  return { compatible: true, fastStart, message: 'Compatible para reproduccion directa.' };
}

function probeFastStart(value: Prisma.JsonValue | null | undefined) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const fastStart = (value as Prisma.JsonObject).fastStart;
  return typeof fastStart === 'boolean' ? fastStart : null;
}
