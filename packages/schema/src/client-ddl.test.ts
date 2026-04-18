import { test, expect } from 'vitest';
import { getClientDDL } from './client-ddl.js';

test('client DDL omits the users table', () => {
  const sql = getClientDDL();
  expect(sql).not.toMatch(/CREATE TABLE.*\busers\b/i);
});

test('client DDL keeps projects, glyphs, layers, sync_log', () => {
  const sql = getClientDDL();
  expect(sql).toMatch(/CREATE TABLE.*\bprojects\b/i);
  expect(sql).toMatch(/CREATE TABLE.*\bglyphs\b/i);
  expect(sql).toMatch(/CREATE TABLE.*\blayers\b/i);
  expect(sql).toMatch(/CREATE TABLE.*\bsync_log\b/i);
});

test('client DDL is deterministic across calls', () => {
  expect(getClientDDL()).toBe(getClientDDL());
});
