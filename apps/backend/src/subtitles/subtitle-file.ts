import { BadRequestException } from '@nestjs/common';
import { SubtitleFormat } from '@prisma/client';

const timestamp = '(?:\\d{2}:)?\\d{2}:\\d{2}[,.]\\d{3}';
const timingLine = new RegExp(`^(${timestamp})\\s+-->\\s+(${timestamp})(?:\\s+.*)?$`);

export type ParsedSubtitle = { content: string; sourceFormat: SubtitleFormat; cueCount: number };

export function parseSubtitleFile(buffer: Buffer, extension: string): ParsedSubtitle {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('El subtitulo debe usar codificacion UTF-8 valida');
  }
  if (decoded.includes('\0')) throw new BadRequestException('El archivo contiene datos binarios no permitidos');
  const text = decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new BadRequestException('El archivo de subtitulos esta vacio');
  if (text.split('\n').some((line) => line.length > 10_000)) throw new BadRequestException('El archivo contiene una linea demasiado larga');
  if (/<\s*(script|iframe|object|embed)\b/i.test(text)) throw new BadRequestException('El subtitulo contiene etiquetas no permitidas');
  if (extension === '.srt') return convertSrtToVtt(text);
  if (extension === '.vtt') return normalizeVtt(text);
  throw new BadRequestException('Solo se permiten archivos VTT o SRT');
}

export function convertSrtToVtt(text: string): ParsedSubtitle {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
    const timing = lines.shift()?.trim() ?? '';
    const match = timingLine.exec(timing);
    if (!match || !lines.some((line) => line.trim())) throw new BadRequestException(`Bloque SRT invalido cerca de: ${timing.slice(0, 80)}`);
    assertTiming(match[1], match[2]);
    cues.push(`${match[1].replace(',', '.')} --> ${match[2].replace(',', '.')}\n${lines.join('\n')}`);
  }
  if (!cues.length) throw new BadRequestException('El archivo SRT no contiene cues validos');
  return { content: `WEBVTT\n\n${cues.join('\n\n')}\n`, sourceFormat: SubtitleFormat.SRT, cueCount: cues.length };
}

export function normalizeVtt(text: string): ParsedSubtitle {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split('\n');
  if (lines[0].trim() !== 'WEBVTT' && !lines[0].startsWith('WEBVTT ')) throw new BadRequestException('El archivo VTT debe comenzar con WEBVTT');
  let cueCount = 0;
  for (const line of lines) {
    const match = timingLine.exec(line.trim());
    if (match) {
      assertTiming(match[1], match[2]);
      cueCount += 1;
    }
  }
  if (!cueCount) throw new BadRequestException('El archivo VTT no contiene cues validos');
  return { content: `${lines.join('\n').trim()}\n`, sourceFormat: SubtitleFormat.VTT, cueCount };
}

function assertTiming(start: string, end: string) {
  if (timestampMs(end) <= timestampMs(start)) throw new BadRequestException('Cada cue debe terminar despues de comenzar');
}

function timestampMs(value: string) {
  const parts = value.replace(',', '.').split(':');
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = Number(parts.pop() ?? 0);
  if (![hours, minutes, seconds].every(Number.isFinite) || minutes > 59 || seconds >= 60) throw new BadRequestException(`Marca de tiempo invalida: ${value}`);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
