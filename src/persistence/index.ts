import type { Persistence } from '../types';

const persistence: Persistence = process.env.MYSQL_HOST
    ? require('./mysql')
    : require('./sqlite');

export = persistence;
