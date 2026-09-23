import sqlite from './sqlite';
import drizzle from './drizzle';
import mysql from './mysql';
import type { Persistence } from '../types';
import { resolvePersistenceDriver } from '../shared/persistenceDriver';

// Validated unconditionally: a misconfigured PERSISTENCE_DRIVER must refuse
// to start even when MYSQL_HOST is unset and SQLite is what actually runs.
const driver = resolvePersistenceDriver();

const persistence: Persistence = !process.env.MYSQL_HOST
    ? sqlite
    : driver === 'drizzle'
      ? drizzle
      : mysql;

export = persistence;
