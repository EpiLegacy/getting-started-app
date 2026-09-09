export interface Item {
    id: string;
    name: unknown;
    completed: unknown;
}

export interface StoredItem {
    id: string;
    name: unknown;
    completed: boolean;
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
