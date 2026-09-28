export type Priority = 'high' | 'medium' | 'low';

export interface Item {
    id: string;
    name: string;
    completed: boolean;
    deadline: string;
    priorisation: Priority;
}

export interface Project {
  id: string;
  name: string;
  user: {
    userid: string,
    email: string,
  }
  items: Item[],
}

export interface StoredItem {
    id: string;
    name: string;
    completed: boolean;
    deadline: string;
    priorisation: Priority;
}

export interface Persistence {
    init(): Promise<void>;
    teardown(): Promise<void>;
    getItems(): Promise<StoredItem[]>;
    getItem(id: string): Promise<StoredItem | undefined>;
    storeItem(item: Item): Promise<void>;
    updateItem(id: string, item: Omit<Item, 'id'>): Promise<void>;
    removeItem(id: string): Promise<void>;
}
