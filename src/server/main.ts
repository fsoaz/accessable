import { startApp } from './app.ts';

const app = await startApp();
console.log('AccessAble is running at ' + app.dashboardOrigin);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
