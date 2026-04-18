const CHANNEL = 'interrobang.tabs';

export function claimSingleTab(): Promise<'leader' | 'follower'> {
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(CHANNEL);
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ch.postMessage({ type: 'leader' });
        resolve('leader');
      }
    }, 250);
    ch.addEventListener('message', (e: MessageEvent<{ type: string }>) => {
      if (e.data.type === 'leader' && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        ch.postMessage({ type: 'busy' });
        resolve('follower');
      }
    });
    ch.postMessage({ type: 'probe' });
  });
}
