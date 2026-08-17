import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminMediaItem, destructiveMediaCopy, mediaStatusLabels, mediaStatusTone } from './media-library';
import { getMediaVersions, mediaCompatibilityMessage } from './media-versions';

const item = { title: 'Serie · E1 Piloto', hlsSize: '2048' } as AdminMediaItem;

describe('media library presentation', () => {
  it('normalizes operational status labels and tones', () => {
    assert.equal(mediaStatusLabels.PROCESSING, 'Procesando');
    assert.match(mediaStatusTone('FAILED'), /coral/);
    assert.match(mediaStatusTone('COMPLETED'), /mint/);
  });

  it('states that HLS deletion preserves the original and unpublishes content', () => {
    const copy = destructiveMediaCopy('HLS', item);
    assert.match(copy.description, /original no sera eliminado/);
    assert.match(copy.description, /despublicado/);
    assert.match(copy.description, /2048/);
  });

  it('uses a stronger irreversible warning for original deletion', () => {
    assert.match(destructiveMediaCopy('ORIGINAL', item).description, /no se puede deshacer/);
  });

  it('keeps original, REMUX and HLS states independent', () => {
    const versions = getMediaVersions({ extension: '.mkv', originalUrl: '/episode.mkv', remuxUrl: '/episode-remux.mp4', remuxStatus: 'READY', hlsStatus: 'ORIGINAL' });
    assert.equal(versions.ORIGINAL.status, 'AVAILABLE');
    assert.equal(versions.REMUX.status, 'AVAILABLE');
    assert.equal(versions.HLS.status, 'NOT_GENERATED');
    assert.match(mediaCompatibilityMessage({ extension: '.mkv', originalUrl: '/episode.mkv', remuxUrl: '/episode-remux.mp4' }), /MP4 compatible/);
  });

  it('shows independent progress and failures for REMUX and HLS', () => {
    const remuxing = getMediaVersions({ originalUrl: '/episode.mkv', remuxStatus: 'PROCESSING', remuxProgress: 47, hlsStatus: 'ORIGINAL' });
    assert.equal(remuxing.REMUX.label, 'Procesando 47%');
    assert.equal(remuxing.HLS.label, 'No generado');
    const hlsFailed = getMediaVersions({ originalUrl: '/episode.mkv', remuxUrl: '/episode.mp4', hlsStatus: 'FAILED' });
    assert.equal(hlsFailed.REMUX.status, 'AVAILABLE');
    assert.equal(hlsFailed.HLS.status, 'FAILED');
  });

  it('reports all three versions only when each one exists', () => {
    const versions = getMediaVersions({ originalUrl: '/episode.mkv', remuxUrl: '/episode.mp4', hlsUrl: '/master.m3u8' });
    assert.deepEqual(Object.values(versions).map((version) => version.status), ['AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
  });
});
