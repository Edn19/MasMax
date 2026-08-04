import { toast } from 'sonner';
import { api, deleteJson, patchJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Comment } from '../../types/models';
import { AdminTable, Panel, ResourceError } from '../components/AdminUi';

export function CommentsAdminPage() {
  const comments = useAsync<Comment[]>(() => api('/admin/comments'), []);

  async function approve(id: string) {
    const saved = await patchJson<Comment>(`/admin/comments/${id}`, { approved: true });
    comments.setData((comments.data ?? []).map((item) => item.id === id ? { ...item, approved: saved.approved } : item));
    toast.success('Comentario aprobado');
  }

  return (
    <Panel title="Comentarios">
      <ResourceError message={comments.error} />
      <AdminTable
        rows={comments.data ?? []}
        columns={['body', 'approved']}
        onApprove={approve}
        onDelete={async (id) => { await deleteJson(`/admin/comments/${id}`); comments.setData((comments.data ?? []).filter((item) => item.id !== id)); }}
      />
    </Panel>
  );
}
