import type { Item } from '../../../../types';
import type { Task } from '../../../../modules/tasks/types';
import { request } from '../../../lib/http';

export const itemsApi = {
  getAll: (signal?: AbortSignal) => request<Task[]>('/items', { signal }),
  getUnassigned: (signal?: AbortSignal) => request<Task[]>('/items/unassigned', { signal }),
  create: (
    item: Omit<Item, 'id'>,
    userId: string,
  ) => request<Task>('/items', {   method: 'POST',   body: JSON.stringify({     ...item,     userId,   }), }),
  update: (item: Item) => request<Task>(`/items/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: item.name, completed: item.completed, deadline: item.deadline, priorisation: item.priorisation }),
  }),
  setCompleted: (id: string, completed: boolean) => request<Task>(`/items/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ completed }),
  }),
  remove: (id: string) => request<void>(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  claim: (id: string) => request<void>(`/items/${encodeURIComponent(id)}/claim`, { method: 'POST' }),
  updateStatus: (
    id: string,
    status: 'todo' | 'in_progress' | 'done'
  ) =>
    request<Item>(`/items/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};
