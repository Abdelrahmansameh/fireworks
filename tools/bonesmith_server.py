#!/usr/bin/env python3
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import re


TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(TOOLS_DIR, '..'))
SKELETON_DIR = os.path.join(PROJECT_ROOT, 'assets', 'skeletons')
MANIFEST_PATH = os.path.join(SKELETON_DIR, 'manifest.json')

app = Flask(__name__, static_folder=PROJECT_ROOT, static_url_path='')
CORS(app)


def sanitize_name(name: str) -> str:
    s = (name or '').lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s)
    s = s.strip('_')
    return s or 'skeleton'


def read_manifest():
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {'skeletons': []}
    return {'skeletons': []}


def write_manifest(manifest):
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')


@app.route('/bonesmith')
def bonesmith_page():
    return send_from_directory(os.path.join(PROJECT_ROOT, 'tools'), 'bonesmith.html')


@app.route('/api/save_skeleton', methods=['POST'])
def save_skeleton():
    data = request.get_json(force=True)
    if not data:
        return jsonify({'ok': False, 'error': 'Missing JSON body'}), 400

    name = data.get('name') or 'skeleton'
    mesh = data.get('meshData') or data.get('mesh') or data.get('content')
    provided_id = data.get('id') or ''

    if mesh is None:
        return jsonify({'ok': False, 'error': 'Missing mesh content (meshData)'}), 400

    os.makedirs(SKELETON_DIR, exist_ok=True)

    manifest = read_manifest()

    # Try to update an existing entry if id provided
    entry = None
    if provided_id:
        for e in manifest.get('skeletons', []):
            if e.get('id') == provided_id:
                entry = e
                break

    if entry:
        filename = entry.get('file')
        filepath = os.path.join(SKELETON_DIR, filename)
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(mesh, f, indent=2)
                f.write('\n')
            return jsonify({'ok': True, 'id': entry.get('id'), 'file': filename, 'manifest': manifest})
        except Exception as ex:
            return jsonify({'ok': False, 'error': str(ex)}), 500

    # Create new file + manifest entry
    base = sanitize_name(name)
    filename = base + '.json'
    existing_files = {e.get('file') for e in manifest.get('skeletons', [])}
    existing_ids = {e.get('id') for e in manifest.get('skeletons', [])}

    suffix = 1
    while filename in existing_files:
        filename = f"{base}_{suffix}.json"
        suffix += 1

    new_id = base
    suffix = 1
    while new_id in existing_ids:
        new_id = f"{base}_{suffix}"
        suffix += 1

    filepath = os.path.join(SKELETON_DIR, filename)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(mesh, f, indent=2)
            f.write('\n')

        manifest.setdefault('skeletons', []).append({'id': new_id, 'name': name, 'file': filename})
        write_manifest(manifest)

        return jsonify({'ok': True, 'id': new_id, 'file': filename, 'manifest': manifest})
    except Exception as ex:
        return jsonify({'ok': False, 'error': str(ex)}), 500


@app.route('/api/list_skeletons')
def list_skeletons():
    return jsonify(read_manifest())


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run Bonesmith dev server')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5000)
    args = parser.parse_args()
    print(f"Serving Bonesmith at http://{args.host}:{args.port}/bonesmith")
    app.run(host=args.host, port=args.port, debug=True)
