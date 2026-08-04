import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCreatedComment } from './comment-feedback';

const base = { id: 'comment', body: 'Contenido', createdAt: new Date(0).toISOString(), user: { name: 'User' } };

describe('comment feedback', () => {
  it('no inserta un comentario pendiente en la lista publica', () => {
    const result = applyCreatedComment([], { ...base, approved: false, status: 'PENDING' });
    assert.deepEqual(result.comments, []);
    assert.equal(result.message, 'Comentario enviado para revision');
  });

  it('inserta la respuesta aprobada del backend', () => {
    const approved = { ...base, approved: true, status: 'APPROVED' as const };
    const result = applyCreatedComment([], approved);
    assert.deepEqual(result.comments, [approved]);
    assert.equal(result.message, 'Comentario publicado');
  });
});
