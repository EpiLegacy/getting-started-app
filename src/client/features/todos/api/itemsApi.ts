import type { Item } from '../../../../types';
import { request } from '../../../lib/http';

export const itemsApi = {
  getAll: () =>
    request<Item[]>('/items'),

  create: (
    item: Omit<Item, 'id'>,
  ) =>
    request<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  update: (item: Item) =>
    request<Item>(`/items/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: item.name,
        completed: item.completed,
        deadline: item.deadline,
        Priorisation: item.priorisation,
      }),
    }),

  remove: (id: string) =>
    request<void>(`/items/${id}`, {
      method: 'DELETE',
    }),
};
