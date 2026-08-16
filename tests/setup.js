import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const testDataDir = path.resolve(import.meta.dirname, '../data/.test');

rmSync(testDataDir, { recursive: true, force: true });
mkdirSync(testDataDir, { recursive: true });

process.env.OWNER ??= '6283187820160';
process.env.BOT_NUMBER ??= '6283187820160';
process.env.PAIRING_CODE ??= 'TESTCODE';
process.env.SESSION_ID ??= 'test';
process.env.ZYRON_DATA_DIR = testDataDir;
