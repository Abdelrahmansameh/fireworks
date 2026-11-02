// Run the mobile browser suite sequentially: node tools/check_mobile_suite.mjs [url]
// Without a URL, start a quiet local Python server on an available port.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server;
let url = process.argv[2];
try {
    if (!url) {
        const socket = createServer();
        await new Promise((resolveListen, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolveListen));
        const { port } = socket.address();
        await new Promise(resolveClose => socket.close(resolveClose));
        url = `http://127.0.0.1:${port}/`;
        const python = process.env.PYTHON ?? 'python';
        server = spawn(python, ['-c', `import http.server; http.server.SimpleHTTPRequestHandler.log_message=lambda *args: None; http.server.ThreadingHTTPServer(('127.0.0.1', ${port}), http.server.SimpleHTTPRequestHandler).serve_forever()`],
            { cwd: root, stdio: 'ignore', windowsHide: true });
        let startupError;
        server.on('error', error => { startupError = error; });
        let ready = false;
        for (let i = 0; i < 100; i++) {
            if (startupError) throw startupError;
            if (server.exitCode !== null) throw new Error(`Local server exited with code ${server.exitCode}`);
            try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch {}
            await delay(100);
        }
        if (!ready) throw new Error(`Local server did not start at ${url}`);
    }
    for (const test of ['check_mobile_panels.mjs', 'check_ui_redesign.mjs', 'check_mobile_ground.mjs', 'check_mobile_cinematic.mjs', 'check_mobile_pan.mjs']) {
        console.log(`\nRunning ${test}`);
        const child = spawn(process.execPath, [resolve(root, 'tools', test), url], { cwd: root, stdio: 'inherit', windowsHide: true });
        const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
        if (code !== 0) throw new Error(`${test} failed (exit ${code})`);
    }
    console.log('\nMobile suite passed.');
} finally { server?.kill(); }
