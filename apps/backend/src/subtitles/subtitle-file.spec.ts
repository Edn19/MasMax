import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { convertSrtToVtt, normalizeVtt, parseSubtitleFile } from './subtitle-file';

describe('subtitle files', () => {
  it('convierte SRT a WebVTT conservando texto y tiempos', () => {
    const result = convertSrtToVtt('1\r\n00:00:01,250 --> 00:00:03,500\r\nHola mundo\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nSegunda linea');
    expect(result.sourceFormat).toBe('SRT');
    expect(result.cueCount).toBe(2);
    expect(result.content).toContain('WEBVTT\n\n00:00:01.250 --> 00:00:03.500');
    expect(result.content).toContain('Hola mundo');
  });

  it('normaliza VTT valido y cuenta sus cues', () => {
    const result = normalizeVtt('WEBVTT\n\n00:01.000 --> 00:02.000\nTexto');
    expect(result.sourceFormat).toBe('VTT');
    expect(result.cueCount).toBe(1);
    expect(result.content.endsWith('\n')).toBe(true);
  });

  it('rechaza tiempos invertidos y archivos sin cues', () => {
    expect(() => normalizeVtt('WEBVTT\n\n00:03.000 --> 00:02.000\nTexto')).toThrow('terminar despues');
    expect(() => normalizeVtt('WEBVTT\n\nSin tiempos')).toThrow('no contiene cues');
  });

  it('rechaza contenido binario, UTF-8 invalido y etiquetas peligrosas', () => {
    expect(() => parseSubtitleFile(Buffer.from('WEBVTT\0'), '.vtt')).toThrow(BadRequestException);
    expect(() => parseSubtitleFile(Buffer.from([0xff, 0xfe, 0xfd]), '.vtt')).toThrow('UTF-8');
    expect(() => parseSubtitleFile(Buffer.from('WEBVTT\n\n00:01.000 --> 00:02.000\n<script>alert(1)</script>'), '.vtt')).toThrow('etiquetas');
  });

  it('rechaza extensiones y bloques SRT invalidos', () => {
    expect(() => parseSubtitleFile(Buffer.from('texto'), '.ass')).toThrow('Solo se permiten');
    expect(() => convertSrtToVtt('1\nesto no es tiempo\nTexto')).toThrow('Bloque SRT invalido');
  });
});
