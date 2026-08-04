import { Comment } from '../types/models';

export function applyCreatedComment(current: Comment[], created: Comment) {
  return {
    comments: created.approved || created.status === 'APPROVED' ? [...current, created] : current,
    message: created.approved || created.status === 'APPROVED' ? 'Comentario publicado' : 'Comentario enviado para revision',
  };
}
