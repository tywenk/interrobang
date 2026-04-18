import {
  BrowserStorageAdapter,
  claimSingleTab,
  createSqliteClient,
  runMigrations,
} from '@interrobang/storage';

let adapterPromise: Promise<BrowserStorageAdapter> | null = null;

export function getStorage(): Promise<BrowserStorageAdapter> {
  if (!adapterPromise) adapterPromise = bootstrap();
  return adapterPromise;
}

async function bootstrap(): Promise<BrowserStorageAdapter> {
  const role = await claimSingleTab();
  if (role === 'follower') {
    throw new Error('SINGLE_TAB');
  }
  const client = createSqliteClient();
  await client.open('interrobang.sqlite');
  await runMigrations(client);
  return new BrowserStorageAdapter(client);
}
