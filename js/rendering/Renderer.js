function earcut(data, holeIndices, dim) {
    dim = dim || 2;
    var hasHoles = holeIndices && holeIndices.length,
        outerLen = hasHoles ? holeIndices[0] * dim : data.length,
        outerNode = linkedList(data, 0, outerLen, dim, true),
        triangles = [];

    if (!outerNode) return triangles;

    var minX, minY, maxX, maxY, xSpan, ySpan, size;
    var invSize = 0;

    if (hasHoles) {
        outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    }

    if (data.length > 80 * dim) {
        minX = maxX = data[0];
        minY = maxY = data[1];
        for (var i = dim; i < outerLen; i += dim) {
            var x = data[i];
            var y = data[i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        xSpan = maxX - minX;
        ySpan = maxY - minY;
        size = Math.max(xSpan, ySpan);
        invSize = size !== 0 ? 1 / size : 0;
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, invSize);

    return triangles;
}

// Helper functions from earcut, inlined:
function linkedList(data, start, end, dim, clockwise) {
    var i, last;
    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
        for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }
    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }
    return last;
}

function signedArea(data, start, end, dim) {
    var sum = 0;
    for (var i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum * 0.5;
}

function insertNode(i, x, y, last) {
    var p = { i: i, x: x, y: y, prev: null, next: null, z: null, prevZ: null, nextZ: null, steiner: false };
    if (!last) {
        p.prev = p;
        p.next = p;
    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }
    return p;
}

function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;
    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
    if (!ear) return;
    if (!pass && invSize) indexCurve(ear, minX, minY, invSize);
    var stop = ear,
        prev,
        next;
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;
        if (invSize ? isEarHashed(ear) : isEar(ear)) {
            triangles.push(prev.i / dim);
            triangles.push(ear.i / dim);
            triangles.push(next.i / dim);
            removeNode(ear);
            ear = next.next;
            stop = next.next;
            continue;
        }
        ear = next;
        if (ear === stop) {
            if (!pass) {
                earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
            }
            return;
        }
    }
}

function isEar(ear) {
    var a = ear.prev,
        b = ear,
        c = ear.next;
    if (area(a, b, c) >= 0) return false;
    var p = ear.next.next;
    while (p !== ear.prev) {
        if (
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0
        ) {
            return false;
        }
        p = p.next;
    }
    return true;
}

function isEarHashed(ear) {
    var a = ear.prev,
        b = ear,
        c = ear.next;
    if (area(a, b, c) >= 0) return false;
    var minTX = Math.min(a.x, b.x, c.x),
        minTY = Math.min(a.y, b.y, c.y),
        maxTX = Math.max(a.x, b.x, c.x),
        maxTY = Math.max(a.y, b.y, c.y),
        minZ = zOrder(minTX, minTY),
        maxZ = zOrder(maxTX, maxTY);
    var p = ear.nextZ;
    while (p && p.z <= maxZ) {
        if (
            p !== ear.prev &&
            p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0
        )
            return false;
        p = p.nextZ;
    }
    p = ear.prevZ;
    while (p && p.z >= minZ) {
        if (
            p !== ear.prev &&
            p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0
        )
            return false;
        p = p.prevZ;
    }
    return true;
}

function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (
        area2(ax, ay, bx, by, cx, cy) >= 0 &&
        area2(px, py, bx, by, cx, cy) >= 0 &&
        area2(ax, ay, px, py, cx, cy) >= 0 &&
        area2(ax, ay, bx, by, px, py) >= 0
    );
}

function area2(ax, ay, bx, by, cx, cy) {
    return area({ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy });
}

function indexCurve(start, minX, minY, invSize) {
    var p = start;
    do {
        if (p.z === null) p.z = zOrder(p.x, p.y, minX, minY);
        p.prevZ = p.prev;
        p.nextZ = p.next;
        p = p.next;
    } while (p !== start);
    p.prevZ.nextZ = null;
    p.prevZ = null;
    sortLinked(p);
}

function sortLinked(list) {
    var inSize = 1,
        numMerges,
        p,
        q,
        pSize,
        qSize,
        e,
        tail;
    do {
        p = list;
        list = null;
        tail = null;
        numMerges = 0;
        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (var i = 0; i < inSize; i++) {
                pSize++;
                q = q.nextZ;
                if (!q) break;
            }
            qSize = inSize;
            while (pSize > 0 || (qSize > 0 && q)) {
                if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                }
                if (tail) tail.nextZ = e;
                else list = e;
                e.prevZ = tail;
                tail = e;
            }
            p = q;
        }
        tail.nextZ = null;
        inSize <<= 1;
    } while (numMerges > 1);
}

function zOrder(x, y, minX, minY) {
    x = 32767 * (x - minX);
    y = 32767 * (y - minY);
    x = x | 0;
    y = y | 0;
    x = (x | (x << 8)) & 0x00ff00ff;
    x = (x | (x << 4)) & 0x0f0f0f0f;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;
    y = (y | (y << 8)) & 0x00ff00ff;
    y = (y | (y << 4)) & 0x0f0f0f0f;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;
    return x | (y << 1);
}

function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;
    var p = start,
        again;
    do {
        again = false;
        if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
            removeNode(p);
            p = end = p.prev;
            if (p === p.next) break;
            again = true;
        } else {
            p = p.next;
        }
    } while (again || p !== end);
    return end;
}

function eliminateHoles(data, holeIndices, outerNode, dim) {
    var queue = [],
        i,
        len,
        start,
        end,
        list;
    for (i = 0, len = holeIndices.length; i < len; i++) {
        start = holeIndices[i] * dim;
        end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
        list = linkedList(data, start, end, dim, false);
        if (list === list.next) list.steiner = true;
        queue.push(getLeftmost(list));
    }
    queue.sort(function (a, b) {
        return a.x - b.x;
    });
    for (i = 0; i < queue.length; i++) {
        eliminateHole(queue[i], outerNode);
        outerNode = filterPoints(outerNode, outerNode.next);
    }
    return outerNode;
}

function getLeftmost(start) {
    var p = start,
        leftmost = start;
    do {
        if (p.x < leftmost.x) leftmost = p;
        p = p.next;
    } while (p !== start);
    return leftmost;
}

function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
        var b = splitPolygon(outerNode, hole);
        filterPoints(b, b.next);
    }
}

function findHoleBridge(hole, outerNode) {
    var p = outerNode,
        hx = hole.x,
        hy = hole.y,
        qx = -Infinity,
        m;
    do {
        if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
            var x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
            if (x <= hx && x > qx) {
                qx = x;
                m = p.x < p.next.x ? p : p.next;
            }
        }
        p = p.next;
    } while (p !== outerNode);
    if (!m) return null;
    var stop = m,
        mx = m.x,
        my = m.y,
        tanMin = Infinity,
        tan,
        px,
        py;
    p = m;
    do {
        if (
            hx >= p.x &&
            p.x >= mx &&
            hx != p.x &&
            pointInTriangle(hole.prev.x, hole.prev.y, hole.x, hole.y, hole.next.x, hole.next.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0
        ) {
            tan = Math.abs(hy - p.y) / (hx - p.x);
            if (tan < tanMin && locallyInside(p, hole)) {
                m = p;
                tanMin = tan;
            }
        }
        p = p.next;
    } while (p !== stop);
    return m;
}

function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0
        ? area(a, b, a.next) >= 0 && area(a.prev, a, b) >= 0
        : area(a, b, a.prev) < 0 || area(a.next, a, b) < 0;
}

function splitPolygon(a, b) {
    var a2 = insertNode(a.i, a.x, a.y, b),
        b2 = insertNode(b.i, b.x, b.y, a);
    var next = a.next;
    a.next = b;
    b.prev = a;
    a2.next = next;
    next.prev = a2;
    return b2;
}

/*************************************************************
 * 2) Shape Builders
 *************************************************************/
function buildCircle(radius = 50, segments = 32) {
    const verts = [0, 0];
    for (let i = 0; i <= segments; i++) {
        const th = (i / segments) * 2 * Math.PI;
        verts.push(radius * Math.cos(th), radius * Math.sin(th));
    }
    const indices = [];
    for (let i = 1; i <= segments; i++) {
        indices.push(0, i, i + 1);
    }
    return {
        vertices: new Float32Array(verts),
        indices: new Uint16Array(indices),
    };
}

function buildRing(outerR = 100, innerR = 50, segments = 32) {
    const verts = [];
    for (let i = 0; i < segments; i++) {
        const t = (i / segments) * 2 * Math.PI;
        verts.push(outerR * Math.cos(t), outerR * Math.sin(t));
    }
    for (let i = 0; i < segments; i++) {
        const t = (i / segments) * 2 * Math.PI;
        verts.push(innerR * Math.cos(t), innerR * Math.sin(t));
    }
    const indices = [];
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const iO = i,
            iO2 = next;
        const iI = i + segments,
            iI2 = next + segments;
        indices.push(iO, iO2, iI, iO2, iI2, iI);
    }
    return {
        vertices: new Float32Array(verts),
        indices: new Uint16Array(indices),
    };
}

function buildStar(points = 5, outerR = 50, innerR = 25) {
    const verts = [0, 0];
    const step = Math.PI / points;
    for (let i = 0; i <= points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = i * step;
        verts.push(r * Math.cos(a), r * Math.sin(a));
    }
    const indices = [];
    for (let i = 1; i < points * 2 + 1; i++) {
        indices.push(0, i, i + 1);
    }
    return {
        vertices: new Float32Array(verts),
        indices: new Uint16Array(indices),
    };
}

function buildHeart(scale = 50, steps = 100) {
    const coords = [];
    for (let i = 0; i <= steps; i++) {
        const t = Math.PI * (i / steps);
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t);
        coords.push(x * scale * 0.2, -y * scale * 0.2);
    }
    coords.push(coords[0], coords[1]);
    const triIndices = earcut(coords, null, 2);
    return {
        vertices: new Float32Array(coords),
        indices: new Uint16Array(triIndices),
    };
}

function buildHelix(turns = 2, radius = 50, pointsPerTurn = 50) {
    const total = turns * pointsPerTurn;
    const verts = [];
    for (let i = 0; i <= total; i++) {
        const ratio = i / total;
        const angle = ratio * turns * 2 * Math.PI;
        const r = radius * (1 - ratio * 0.5);
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle) + ratio * 200;
        verts.push(x, y);
    }
    return { vertices: new Float32Array(verts), indices: null };
}

function buildPolygon(points) {
    let flat = [];
    if (Array.isArray(points[0])) {
        for (let i = 0; i < points.length; i++) {
            flat.push(points[i][0], points[i][1]);
        }
    } else {
        flat = points;
    }
    const triIndices = earcut(flat, null, 2);
    return {
        vertices: new Float32Array(flat),
        indices: new Uint16Array(triIndices),
    };
}

function buildStrokeGeometry(points, strokeWidth = 5) {
    if (points.length < 4) {
        return { vertices: new Float32Array([]), indices: null };
    }
    const verts = [],
        inds = [];
    for (let i = 0; i < points.length - 2; i += 2) {
        const x1 = points[i],
            y1 = points[i + 1];
        const x2 = points[i + 2],
            y2 = points[i + 3];
        const dx = x2 - x1,
            dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) continue;
        const nx = -dy / len,
            ny = dx / len;
        const half = strokeWidth * 0.5;
        const x1L = x1 + nx * half,
            y1L = y1 + ny * half;
        const x1R = x1 - nx * half,
            y1R = y1 - ny * half;
        const x2L = x2 + nx * half,
            y2L = y2 + ny * half;
        const x2R = x2 - nx * half,
            y2R = y2 - ny * half;
        const base = verts.length / 2;
        verts.push(x1L, y1L, x1R, y1R, x2L, y2L, x2R, y2R);
        inds.push(base, base + 1, base + 2, base + 1, base + 2, base + 3);
    }
    return {
        vertices: new Float32Array(verts),
        indices: new Uint16Array(inds),
    };
}

/*************************************************************
 * 3) Data Structures for Normal & Instanced
 *************************************************************/
const BlendMode = {
    NORMAL: 'normal',
    ADDITIVE: 'additive',
    NO: 'no',
    MULTIPL: 'multiply',
};

class Shape2D {
    constructor({
        vertices = null,
        indices = null,
        color = [1, 1, 1, 1], 
        position = [0, 0],
        rotation = 0,
        scale = [1, 1],
        zIndex = 0,
        blendMode = BlendMode.NORMAL,
        isStroke = false,
    }) {
        this.vertices = vertices;
        this.indices = indices;
        this.color = color.slice(); 
        this.position = position.slice();
        this.rotation = rotation;
        this.scale = scale.slice();
        this.zIndex = zIndex;
        this.blendMode = blendMode;
        this.isStroke = isStroke;

        // GPU buffers
        this._vbo = null;
        this._ibo = null;
        this._vertexCount = 0;
    }
}


class InstancedGroup {
    constructor({ baseGeometry, maxInstances = 10000, zIndex = 0, blendMode = BlendMode.NORMAL }) {
        this.baseGeometry = baseGeometry; 
        this.maxInstances = maxInstances;
        this.zIndex = zIndex;
        this.blendMode = blendMode;

        // instance data
        this.instanceStrideFloats = 9;
        this.instanceData = new Float32Array(maxInstances * this.instanceStrideFloats);
        this.instanceCount = 0;

        // GPU buffer
        this._instanceBuffer = null;
        this._vao = null;
    }
    clear() {
        this.instanceCount = 0;
    }
    addInstance(pos, rotation, scale, color) {
        const i = this.instanceCount;
        if (i >= this.maxInstances) return;
        const base = i * this.instanceStrideFloats;
        this.instanceData[base + 0] = pos[0];
        this.instanceData[base + 1] = pos[1];
        this.instanceData[base + 2] = rotation;
        this.instanceData[base + 3] = scale[0];
        this.instanceData[base + 4] = scale[1];
        this.instanceData[base + 5] = color[0];
        this.instanceData[base + 6] = color[1];
        this.instanceData[base + 7] = color[2];
        this.instanceData[base + 8] = color[3];
        this.instanceCount++;
    }


    updateInstanceColor(index, color) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }
        const base = index * this.instanceStrideFloats + 5; 
        this.instanceData[base] = color[0];
        this.instanceData[base + 1] = color[1];
        this.instanceData[base + 2] = color[2];
        this.instanceData[base + 3] = color[3];
    }
}

class Renderer2D {
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', { antialias: true });
        if (!this.gl) {
            throw new Error('WebGL2 not supported here.');
        }
        if (opts.width) canvas.width = opts.width;
        if (opts.height) canvas.height = opts.height;

        this.normalShapes = [];
        this.instancedGroups = []; 

        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraZoom = 1.0;

        const gl = this.gl;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.normalProgram = this._initProgram(this._normalVS(), this._normalFS());
        this.a_position_Normal = gl.getAttribLocation(this.normalProgram, 'a_position');
        this.u_matrix_Normal = gl.getUniformLocation(this.normalProgram, 'u_matrix');
        this.u_color_Normal = gl.getUniformLocation(this.normalProgram, 'u_color');

        this.instancedProgram = this._initProgram(this._instancedVS(), this._instancedFS());
        this.a_position_Inst = gl.getAttribLocation(this.instancedProgram, 'a_position');
        this.a_offset_Inst = gl.getAttribLocation(this.instancedProgram, 'a_offset');
        this.a_rotation_Inst = gl.getAttribLocation(this.instancedProgram, 'a_rotation');
        this.a_scale_Inst = gl.getAttribLocation(this.instancedProgram, 'a_scale');
        this.a_color_Inst = gl.getAttribLocation(this.instancedProgram, 'a_color');
        this.u_proj_Inst = gl.getUniformLocation(this.instancedProgram, 'u_proj');
    }


    setCamera({ x = 0, y = 0, zoom = 1.0 }) {
        this.cameraX = x;
        this.cameraY = y;
        this.cameraZoom = zoom;
    }

    createNormalShape(params) {
        const shape = new Shape2D(params);
        this._uploadShapeBuffers(shape);
        this.normalShapes.push(shape);
        return shape;
    }
    updateNormalShape(shape, changes) {
        let reuploadVerts = false,
            reuploadIdx = false;
        if (changes.vertices !== undefined) {
            shape.vertices = changes.vertices;
            reuploadVerts = true;
        }
        if (changes.indices !== undefined) {
            shape.indices = changes.indices;
            reuploadIdx = true;
        }
        if (changes.color !== undefined) shape.color = changes.color.slice();
        if (changes.position !== undefined) shape.position = changes.position.slice();
        if (changes.rotation !== undefined) shape.rotation = changes.rotation;
        if (changes.scale !== undefined) shape.scale = changes.scale.slice();
        if (changes.zIndex !== undefined) shape.zIndex = changes.zIndex;
        if (changes.blendMode !== undefined) shape.blendMode = changes.blendMode;
        if (changes.isStroke !== undefined) shape.isStroke = changes.isStroke;

        if (reuploadVerts) this._uploadShapeVertices(shape);
        if (reuploadIdx) this._uploadShapeIndices(shape);
    }
    removeNormalShape(shape) {
        const idx = this.normalShapes.indexOf(shape);
        if (idx >= 0) this.normalShapes.splice(idx, 1);
        if (shape._vbo) {
            this.gl.deleteBuffer(shape._vbo);
            shape._vbo = null;
        }
        if (shape._ibo) {
            this.gl.deleteBuffer(shape._ibo);
            shape._ibo = null;
        }
    }


    createInstancedGroup({ vertices, indices, maxInstances = 10000, zIndex = 0, blendMode = BlendMode.NORMAL }) {
        const gl = this.gl;
        const baseGeom = {};
        baseGeom.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, baseGeom.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        baseGeom.numVerts = vertices.length / 2;

        if (indices) {
            baseGeom.indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, baseGeom.indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            baseGeom.numIndices = indices.length;
        } else {
            baseGeom.indexBuffer = null;
            baseGeom.numIndices = 0;
        }

        const group = new InstancedGroup({ baseGeometry: baseGeom, maxInstances, zIndex, blendMode });
        group._instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, group._instanceBuffer);
        const totalBytes = maxInstances * 9 * 4; 
        gl.bufferData(gl.ARRAY_BUFFER, totalBytes, gl.DYNAMIC_DRAW);

        group._vao = gl.createVertexArray();
        gl.bindVertexArray(group._vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, baseGeom.vertexBuffer);
        gl.enableVertexAttribArray(this.a_position_Inst);
        gl.vertexAttribPointer(this.a_position_Inst, 2, gl.FLOAT, false, 0, 0);

        if (baseGeom.indexBuffer) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, baseGeom.indexBuffer);
        }

        // instance buffer => offset(2), rotation(1), scale(2), color(4)
        gl.bindBuffer(gl.ARRAY_BUFFER, group._instanceBuffer);
        const stride = 9 * 4;
        // offset => loc= a_offset_Inst
        gl.enableVertexAttribArray(this.a_offset_Inst);
        gl.vertexAttribPointer(this.a_offset_Inst, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(this.a_offset_Inst, 1);

        // rotation => a_rotation_Inst
        gl.enableVertexAttribArray(this.a_rotation_Inst);
        gl.vertexAttribPointer(this.a_rotation_Inst, 1, gl.FLOAT, false, stride, 2 * 4);
        gl.vertexAttribDivisor(this.a_rotation_Inst, 1);

        // scale => a_scale_Inst
        gl.enableVertexAttribArray(this.a_scale_Inst);
        gl.vertexAttribPointer(this.a_scale_Inst, 2, gl.FLOAT, false, stride, 3 * 4);
        gl.vertexAttribDivisor(this.a_scale_Inst, 1);

        // color => a_color_Inst
        gl.enableVertexAttribArray(this.a_color_Inst);
        gl.vertexAttribPointer(this.a_color_Inst, 4, gl.FLOAT, false, stride, 5 * 4);
        gl.vertexAttribDivisor(this.a_color_Inst, 1);

        gl.bindVertexArray(null);

        this.instancedGroups.push(group);
        return group;
    }
    removeInstancedGroup(group) {
        const idx = this.instancedGroups.indexOf(group);
        if (idx >= 0) this.instancedGroups.splice(idx, 1);
        const gl = this.gl;
        if (group._instanceBuffer) {
            gl.deleteBuffer(group._instanceBuffer);
            group._instanceBuffer = null;
        }
        if (group._vao) {
            gl.deleteVertexArray(group._vao);
            group._vao = null;
        }
        if (group.baseGeometry) {
            if (group.baseGeometry.vertexBuffer) {
                gl.deleteBuffer(group.baseGeometry.vertexBuffer);
                group.baseGeometry.vertexBuffer = null;
            }
            if (group.baseGeometry.indexBuffer) {
                gl.deleteBuffer(group.baseGeometry.indexBuffer);
                group.baseGeometry.indexBuffer = null;
            }
        }
    }

    /****************************************
     * The main rendering
     ****************************************/
    drawFrame() {
        this._resizeIfNeeded();
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Compute the orthographic bounds based on cameraX, cameraY, cameraZoom
        const left = this.cameraX;
        const right = this.cameraX + this.canvas.width / this.cameraZoom;
        const top = this.cameraY;
        const bottom = this.cameraY + this.canvas.height / this.cameraZoom;
        // near/far are -1,1
        this._projectionMatrix = this._makeOrtho(left, right, bottom, top, -1, 1);

        // gather all items (normal or instanced) for zIndex sort
        const items = [];
        // normal shapes
        for (const sh of this.normalShapes) {
            items.push({ type: 'normal', data: sh, zIndex: sh.zIndex, blend: sh.blendMode });
        }
        // instanced groups
        for (const grp of this.instancedGroups) {
            items.push({ type: 'instanced', data: grp, zIndex: grp.zIndex, blend: grp.blendMode });
        }
        items.sort((a, b) => a.zIndex - b.zIndex);

        // draw them in order
        for (const item of items) {
            if (item.type === 'normal') {
                this._drawNormalShape(item.data);
            } else {
                this._drawInstancedGroup(item.data);
            }
        }
    }

    /****************************************
     * Internal: draw a normal shape
     ****************************************/
    _drawNormalShape(shape) {
        const gl = this.gl;
        // set blend
        switch (shape.blendMode) {
            case BlendMode.ADDITIVE:
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                break;
            case BlendMode.NO_BLENDING:
                gl.blendFunc(gl.ONE, gl.ONE);
                break;
            case BlendMode.MULTIPLY_BLENDING:
                gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                break;
            case BlendMode.NORMAL:
            default:
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                break;
        }
        gl.useProgram(this.normalProgram);

        // compute transform => 4x4
        const model = this._computeModelMatrix(shape.position, shape.rotation, shape.scale);
        const mvp = this._multiplyMat4(this._projectionMatrix, model);

        gl.uniformMatrix4fv(this.u_matrix_Normal, false, mvp);
        gl.uniform4fv(this.u_color_Normal, new Float32Array(shape.color));

        // bind shape buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, shape._vbo);
        gl.enableVertexAttribArray(this.a_position_Normal);
        gl.vertexAttribPointer(this.a_position_Normal, 2, gl.FLOAT, false, 0, 0);

        if (shape.indices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape._ibo);
            const drawMode = shape.isStroke ? gl.LINES : gl.TRIANGLES;
            gl.drawElements(drawMode, shape.indices.length, gl.UNSIGNED_SHORT, 0);
        } else {
            const drawMode = shape.isStroke ? gl.LINES : gl.TRIANGLES;
            gl.drawArrays(drawMode, 0, shape._vertexCount);
        }
    }

    /****************************************
     * Internal: draw an instanced group
     ****************************************/
    _drawInstancedGroup(group) {
        const gl = this.gl;
        if (group.instanceCount <= 0) return;

        // set blend
        switch (group.blendMode) {
            case BlendMode.ADDITIVE:
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                break;
            case BlendMode.NO_BLENDING:
                gl.blendFunc(gl.ONE, gl.ZERO);
                break;
            case BlendMode.MULTIPLY_BLENDING:
                gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                break;
            case BlendMode.NORMAL:
            default:
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                break;
        }
        gl.useProgram(this.instancedProgram);
        gl.uniformMatrix4fv(this.u_proj_Inst, false, this._projectionMatrix);

        // update instance buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, group._instanceBuffer);
        const subData = group.instanceData.subarray(0, group.instanceCount * group.instanceStrideFloats);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, subData);

        // bind VAO
        gl.bindVertexArray(group._vao);

        if (group.baseGeometry.numIndices > 0) {
            gl.drawElementsInstanced(
                gl.TRIANGLES,
                group.baseGeometry.numIndices,
                gl.UNSIGNED_SHORT,
                0,
                group.instanceCount
            );
        } else {
            gl.drawArraysInstanced(
                gl.TRIANGLES,
                0,
                group.baseGeometry.numVerts,
                group.instanceCount
            );
        }
        gl.bindVertexArray(null);
    }

    /****************************************
     * Internal shape buffer uploads
     ****************************************/
    _uploadShapeBuffers(shape) {
        const gl = this.gl;
        shape._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, shape._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, shape.vertices, gl.STATIC_DRAW);
        shape._vertexCount = shape.vertices.length / 2;

        if (shape.indices) {
            shape._ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape._ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shape.indices, gl.STATIC_DRAW);
        }
    }
    _uploadShapeVertices(shape) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, shape._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, shape.vertices, gl.STATIC_DRAW);
        shape._vertexCount = shape.vertices.length / 2;
    }
    _uploadShapeIndices(shape) {
        const gl = this.gl;
        if (!shape._ibo) shape._ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape._ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shape.indices, gl.STATIC_DRAW);
    }

    /****************************************
     * Internal Shaders
     ****************************************/
    _normalVS() {
        return `
        attribute vec2 a_position;
        uniform mat4 u_matrix;
        uniform vec4 u_color; // not used in vertex, but we unify usage
        void main(){
            gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
        }
        `;
    }
    _normalFS() {
        return `
        precision mediump float;
        uniform vec4 u_color;
        void main(){
            gl_FragColor = u_color;
        }
        `;
    }
    _instancedVS() {
        return `#version 300 es
        layout(location=0) in vec2 a_position; 
        layout(location=1) in vec2 a_offset; 
        layout(location=2) in float a_rotation;
        layout(location=3) in vec2 a_scale;
        layout(location=4) in vec4 a_color;

        uniform mat4 u_proj;

        out vec4 v_color;

        void main(){
            float c = cos(a_rotation);
            float s = sin(a_rotation);
            vec2 scaled = a_position * a_scale;
            vec2 rotated;
            rotated.x = c * scaled.x - s * scaled.y;
            rotated.y = s * scaled.x + c * scaled.y;
            vec2 finalPos = rotated + a_offset;
            gl_Position = u_proj * vec4(finalPos, 0.0, 1.0);
            v_color = a_color;
        }
        `;
    }
    _instancedFS() {
        return `#version 300 es
        precision mediump float;
        in vec4 v_color;
        out vec4 outColor;

        void main(){
            outColor = v_color;
        }
        `;
    }

    _initProgram(vsSrc, fsSrc) {
        const gl = this.gl;
        const vs = this._compileShader(vsSrc, gl.VERTEX_SHADER);
        const fs = this._compileShader(fsSrc, gl.FRAGMENT_SHADER);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error('Link error: ' + gl.getProgramInfoLog(prog));
        }
        return prog;
    }
    _compileShader(src, type) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    /****************************************
     * Camera & Matrix
     ****************************************/
    _makeOrtho(left, right, bottom, top, near, far) {
        const out = new Float32Array(16);
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        out[0] = -2 * lr;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[5] = -2 * bt;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[10] = 2 * nf;
        out[11] = 0;
        out[12] = (left + right) * lr;
        out[13] = (top + bottom) * bt;
        out[14] = (far + near) * nf;
        out[15] = 1;
        return out;
    }

    _computeModelMatrix(pos, rot, scl) {
        const cosr = Math.cos(rot),
            sinr = Math.sin(rot);
        const [sx, sy] = scl;
        const [px, py] = pos;
        const m = new Float32Array(16);
        // col-major
        m[0] = cosr * sx;
        m[1] = sinr * sx;
        m[2] = 0;
        m[3] = 0;
        m[4] = -sinr * sy;
        m[5] = cosr * sy;
        m[6] = 0;
        m[7] = 0;
        m[8] = 0;
        m[9] = 0;
        m[10] = 1;
        m[11] = 0;
        m[12] = px;
        m[13] = py;
        m[14] = 0;
        m[15] = 1;
        return m;
    }
    _multiplyMat4(a, b) {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            const ai0 = a[i],
                ai1 = a[i + 4],
                ai2 = a[i + 8],
                ai3 = a[i + 12];
            out[i] = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3];
            out[i + 4] = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7];
            out[i + 8] = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11];
            out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
        }
        return out;
    }

    /****************************************
     * Resize
     ****************************************/
    _resizeIfNeeded() {
        const w = this.canvas.clientWidth | 0;
        const h = this.canvas.clientHeight | 0;
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }
}

export {
    Renderer2D,
    BlendMode,
    buildCircle,
    buildRing,
    buildStar,
    buildHeart,
    buildHelix,
    buildPolygon,
    buildStrokeGeometry,
};
