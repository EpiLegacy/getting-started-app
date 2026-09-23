import waitPort from 'wait-port';
import fs from 'fs';
import mysql from 'mysql2';
import type { Pool, RowDataPacket } from 'mysql2';
import type { Item, Priority, StoredItem } from '../types';

interface DbRow extends RowDataPacket {
    id: string;
    name: string;
    completed: number;
    deadline: string;
    priorisation: string;
}

const {
    MYSQL_HOST: HOST,
    MYSQL_HOST_FILE: HOST_FILE,
    MYSQL_PORT: PORT,
    MYSQL_USER: USER,
    MYSQL_USER_FILE: USER_FILE,
    MYSQL_PASSWORD: PASSWORD,
    MYSQL_PASSWORD_FILE: PASSWORD_FILE,
    MYSQL_DB: DB,
    MYSQL_DB_FILE: DB_FILE,
} = process.env;

let pool: Pool;

async function init(): Promise<void> {
    const host = HOST_FILE ? fs.readFileSync(HOST_FILE, 'utf8') : HOST;
    const user = USER_FILE ? fs.readFileSync(USER_FILE, 'utf8') : USER;
    const password = PASSWORD_FILE ? fs.readFileSync(PASSWORD_FILE, 'utf8') : PASSWORD;
    const database = DB_FILE ? fs.readFileSync(DB_FILE, 'utf8') : DB;

    await waitPort({ 
        host, 
        port: PORT ? Number(PORT) : 3306,
        timeout: 10000,
        waitForDns: true,
    });

    pool = mysql.createPool({
        connectionLimit: 5,
        host,
        port: PORT ? Number(PORT) : undefined,
        user,
        password,
        database,
        charset: 'utf8mb4',
    });

    return new Promise((acc, rej) => {
        pool.query(
            `CREATE TABLE IF NOT EXISTS todo_items (
                id varchar(36),
                name varchar(255),
                completed boolean,
                deadline varchar(255),
                priorisation varchar(255)
            ) DEFAULT CHARSET utf8mb4`,
            err => {
                if (err) return rej(err);

                console.log(`Connected to mysql db at host ${HOST}`);
                acc();
            },
        );
    });
}

async function teardown(): Promise<void> {
    return new Promise((acc, rej) => {
        pool.end(err => {
            if (err) rej(err);
            else acc();
        });
    });
}

async function getItems(): Promise<StoredItem[]> {
    return new Promise((acc, rej) => {
        pool.query<DbRow[]>(
            'SELECT * FROM todo_items',
            (err, rows) => {
                if (err) return rej(err);

                acc(
                    rows.map(item => ({
                        id: item.id,
                        name: item.name,
                        completed: item.completed === 1,
                        deadline: item.deadline,
                        priorisation: item.priorisation as Priority,
                    })),
                );
            },
        );
    });
}

async function getItem(id: string): Promise<StoredItem | undefined> {
    return new Promise((acc, rej) => {
        pool.query<DbRow[]>(
            'SELECT * FROM todo_items WHERE id=?',
            [id],
            (err, rows) => {
                if (err) return rej(err);

                const item = rows[0];

                if (!item) {
                    return acc(undefined);
                }

                acc({
                    id: item.id,
                    name: item.name,
                    completed: item.completed === 1,
                    deadline: item.deadline,
                    priorisation: item.priorisation as Priority,
                });
            },
        );
    });
}

async function storeItem(item: Item): Promise<void> {
    return new Promise((acc, rej) => {
        pool.query(
            `INSERT INTO todo_items
                (id, name, completed, deadline, priorisation)
             VALUES (?, ?, ?, ?, ?)`,
            [
                item.id,
                item.name,
                item.completed ? 1 : 0,
                item.deadline,
                item.priorisation,
            ],
            err => {
                if (err) return rej(err);

                acc();
            },
        );
    });
}

async function updateItem(
    id: string,
    item: Omit<Item, 'id'>,
): Promise<void> {
    return new Promise((acc, rej) => {
        pool.query(
            `UPDATE todo_items
             SET name=?, completed=?, deadline=?, priorisation=?
             WHERE id=?`,
            [
                item.name,
                item.completed ? 1 : 0,
                item.deadline,
                item.priorisation,
                id,
            ],
            err => {
                if (err) return rej(err);

                acc();
            },
        );
    });
}

async function removeItem(id: string): Promise<void> {
    return new Promise((acc, rej) => {
        pool.query(
            'DELETE FROM todo_items WHERE id = ?',
            [id],
            err => {
                if (err) return rej(err);

                acc();
            },
        );
    });
}

export = {
    init,
    teardown,
    getItems,
    getItem,
    storeItem,
    updateItem,
    removeItem,
};
