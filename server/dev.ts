import 'dotenv/config';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { app, root } from './index';
import { listenOnAvailablePort } from './listen';

const httpServer = createHttpServer(app);
const vite = await createViteServer({
  configFile: `${root}/vite.config.ts`,
  server: { middlewareMode: true, ws: { server: httpServer } },
  appType: 'spa'
});
app.use(vite.middlewares);

const port = Number(process.env.DEV_PORT || 5173);
const activePort = await listenOnAvailablePort(httpServer, port);
if (activePort !== port) console.warn(`Port ${port} is already in use; using ${activePort} instead.`);
console.log(`Safety-aware app listening on http://localhost:${activePort}`);
