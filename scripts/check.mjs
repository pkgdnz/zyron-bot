import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOTS = ['.'];
const IGNORED = new Set([
    '.git',
    'node_modules',
    'data'
]);

async function collectJsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (IGNORED.has(entry.name)) continue;

        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...await collectJsFiles(filePath));
            continue;
        }

        if (entry.isFile() && filePath.endsWith('.js')) {
            files.push(filePath);
        }
    }

    return files;
}

function checkFile(filePath) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--check', filePath], {
            stdio: 'inherit'
        });

        child.on('error', reject);
        child.on('exit', code => resolve(code === 0));
    });
}

const files = [];
for (const root of ROOTS) {
    files.push(...await collectJsFiles(path.resolve(root)));
}

files.sort();

let failed = false;

for (const file of files) {
    const ok = await checkFile(file);

    if (!ok) {
        failed = true;
        console.error(`[check] failed: ${path.relative(process.cwd(), file)}`);
    }
}

if (failed) {
    process.exitCode = 1;
} else {
    console.log(`[check] ${files.length} JavaScript file(s) passed syntax validation.`);
}
