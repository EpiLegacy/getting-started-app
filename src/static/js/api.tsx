export type Priority = 'high' | 'medium' | 'low';

export interface Item {
  id: string;
  name: string;
  completed: boolean;
  deadline: string;
  priorisation: Priority;
}

async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(
      `API error: ${response.status} ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

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
