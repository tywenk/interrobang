import {
  BrowserStorageAdapter,
  claimSingleTab,
  createSqliteClient,
  runMigrations,
} from '@interrobang/storage';

export async function createStorage(): Promise<BrowserStorageAdapter> {
  const role = await claimSingleTab();
  if (role === 'follower') throw new Error('SINGLE_TAB');
  const client = createSqliteClient();
  await client.open('interrobang.sqlite');
  await runMigrations(client);
  return new BrowserStorageAdapter(client);
}
