import dotenv from 'dotenv';
import { createAssistantApp } from './assistant_api.mjs';
dotenv.config();
const host = process.env.ANALYZER_HOST || '127.0.0.1';
const port = Number(process.env.ANALYZER_PORT || 8787);
createAssistantApp().listen(port, host, () => console.log(`Assistant/analyzer listening on http://${host}:${port}`));
