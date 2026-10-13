import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import { app, root } from './index';
import { listenOnAvailablePort } from './listen';

app.use(express.static(`${root}/dist`));
const port = Number(process.env.PORT || 8787);
const activePort = await listenOnAvailablePort(createServer(app), port);
console.log(`Safety-aware app listening on http://localhost:${activePort}`);
