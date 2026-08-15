import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminMediaItem, destructiveMediaCopy, mediaStatusLabels, mediaStatusTone } from './media-library';

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
});
