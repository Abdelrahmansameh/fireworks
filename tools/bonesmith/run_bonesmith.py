#!/usr/bin/env python3
"""Launch the Bonesmith dev server and open the browser when ready.

Starts `bonesmith_server.py` as a subprocess, polls the `/bonesmith` URL
until it responds, then opens the default browser. Intended to be run from
a VS Code task or the command line.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import webbrowser


TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_PATH = os.path.join(TOOLS_DIR, 'bonesmith_server.py')


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Start Bonesmith dev server and open browser')
    p.add_argument('--host', default='127.0.0.1', help='Host to bind')
    p.add_argument('--port', type=int, default=5000, help='Port to bind')
    p.add_argument('--timeout', type=float, default=30.0, help='Seconds to wait for server')
    p.add_argument('--no-browser', action='store_true', help="Don't open the browser")
    return p.parse_args()


def start_server(host: str, port: int) -> subprocess.Popen:
    cmd = [sys.executable, SERVER_PATH, '--host', host, '--port', str(port)]
    print('Launching:', ' '.join(cmd))
    # Start server as a child process; leave stdout/stderr connected so terminal shows logs.
    return subprocess.Popen(cmd)


def wait_for_url(url: str, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def main() -> int:
    args = parse_args()
    url = f'http://{args.host}:{args.port}/bonesmith'

    if not os.path.exists(SERVER_PATH):
        print(f'Error: cannot find bonesmith_server.py at {SERVER_PATH}', file=sys.stderr)
        return 2

    proc = start_server(args.host, args.port)

    try:
        ready = wait_for_url(url, args.timeout)
        if not ready:
            print(f'Error: timed out waiting for {url}', file=sys.stderr)
            return 3

        print(f'Server reachable at {url}')
        if not args.no_browser:
            webbrowser.open(url)

        print('Bonesmith launched.')
        return 0
    except KeyboardInterrupt:
        print('Aborted by user', file=sys.stderr)
        return 4


if __name__ == '__main__':
    raise SystemExit(main())
