// Runs around every test file of the database tests: closes the databases the file left open.
import { afterAll } from 'vitest';
import { closeDatabases } from './pglite';

afterAll(() => closeDatabases('file'));
