class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    set(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;

        return this;
    }

    subtract(v) {
        this.x -= v.x;
        this.y -= v.y;

        return this;
    }

    scale(scalar) {
        this.x *= scalar;
        this.y *= scalar;

        return this;
    }

    addScaledVector(v, scalar) {
        this.x += v.x * scalar;
        this.y += v.y * scalar;
        return this;
    }

    length() {
        return Math.hypot(this.x, this.y);
    }

    normalize() {
        const len = this.length();
        if (len === 0) return new Vector2(0, 0);
        let normalX = this.x / len;
        let normalY = this.y / len;
        if (Math.abs(normalX) < 0.000001)
            normalX = 0;
        if (Math.abs(normalY) < 0.000001)
            normalY = 0;
        this.x = normalX;
        this.y = normalY;

        return this;
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    copy(other) {
        this.x = other.x;
        this.y = other.y;
    }

    toArray() {
        return [this.x, this.y];
    }

    getAngle() {
        return Math.atan2(this.y, this.x);
    }

    static dot(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y;
    }

    static lerp(v1, v2, t) {
        return new Vector2(
            v1.x + (v2.x - v1.x) * t,
            v1.y + (v2.y - v1.y) * t
        );
    }

    distanceTo(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

class Color {
    constructor(r = 1, g = 1, b = 1, a = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    set(r, g, b, a = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    setAlpha(a) {
        this.a = a;
    }

    multiply(scalar) {
        return new Color(
            this.r * scalar,
            this.g * scalar,
            this.b * scalar,
            this.a
        );
    }

    clone() {
        return new Color(this.r, this.g, this.b, this.a);
    }

    copy(other) {
        this.r = other.r;
        this.g = other.g;
        this.b = other.b;
        this.a = other.a;
    }

    toArray() {
        return [this.r, this.g, this.b, this.a];
    }


    static lerp(c1, c2, t) {
        return new Color(
            c1.r + (c2.r - c1.r) * t,
            c1.g + (c2.g - c1.g) * t,
            c1.b + (c2.b - c1.b) * t,
            c1.a + (c2.a - c1.a) * t
        );
    }
}

// Earcut Implementation
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
function buildCircle(radius = 1, segments = 32) {
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

function buildRing(outerR = 2, innerR = 1, segments = 32) {
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

function buildStar(points = 5, outerR = 2, innerR = 1) {
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

function buildDroplet(scale = 1, steps = 100) {
    const coords = [];
    for (let i = 0; i <= steps; i++) {
        const t = Math.PI * (i / steps);
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t);
        coords.push(x * scale * 0.2, y * scale * 0.2); // Removed the negation on y
    }
    coords.push(coords[0], coords[1]);
    const triIndices = earcut(coords, null, 2);
    return {
        vertices: new Float32Array(coords),
        indices: new Uint16Array(triIndices),
    };
}

function buildSliceBurst(size = 10) {
    const coords = [];
    const x1=  0, x2 = size / 2, x3 = size;
    const y1 = 0, y2 = size / 20, y3 = 0;
    coords.push(x1, y1, x2, y2, x3, y3);
    const triIndices = earcut(coords, null, 2);
    return {
        vertices: new Float32Array(coords),
        indices: new Uint16Array(triIndices),
    };
}

function buildTriangle(base = 1, height = 2) {
    const coords = [];

    coords.push(-base / 2, 0);
    coords.push(base / 2, 0);
    coords.push(0, height); // Removed the negation on y

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

function buildTexturedSquare(width = 1, height = 1) {
    const halfW = width / 2;
    const halfH = height / 2;

    const vertices = new Float32Array([
        -halfW, -halfH, // bottom-left
        halfW, -halfH, // bottom-right
        halfW, halfH, // top-right
        -halfW, halfH  // top-left
    ]);

    // Texture coordinates (UV)
    const texCoords = new Float32Array([
        0, 1, // bottom-left
        1, 1, // bottom-right
        1, 0, // top-right
        0, 0  // top-left
    ]);

    const indices = new Uint16Array([
        0, 1, 2,
        0, 2, 3
    ]);

    return {
        vertices: vertices,
        texCoords: texCoords,
        indices: indices
    };
}

function invertMatrix(m) {
    const inv = new Float32Array(16);
    const det =
        m[0] * m[5] * m[10] * m[15] -
        m[0] * m[5] * m[11] * m[14] -
        m[0] * m[9] * m[6] * m[15] +
        m[0] * m[9] * m[7] * m[14] +
        m[0] * m[13] * m[6] * m[11] -
        m[0] * m[13] * m[7] * m[10] -
        m[4] * m[1] * m[10] * m[15] +
        m[4] * m[1] * m[11] * m[14] +
        m[4] * m[9] * m[2] * m[15] -
        m[4] * m[9] * m[3] * m[14] -
        m[4] * m[13] * m[2] * m[11] +
        m[4] * m[13] * m[3] * m[10] +
        m[8] * m[1] * m[6] * m[15] -
        m[8] * m[1] * m[7] * m[14] -
        m[8] * m[5] * m[2] * m[15] +
        m[8] * m[5] * m[3] * m[14] +
        m[8] * m[13] * m[2] * m[7] -
        m[8] * m[13] * m[3] * m[6] -
        m[12] * m[1] * m[6] * m[11] +
        m[12] * m[1] * m[7] * m[10] +
        m[12] * m[5] * m[2] * m[11] -
        m[12] * m[5] * m[3] * m[10] -
        m[12] * m[9] * m[2] * m[7] +
        m[12] * m[9] * m[3] * m[6];

    if (det === 0) return null;

    const invDet = 1 / det;

    inv[0] = (m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10]) * invDet;
    inv[1] = (-m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10]) * invDet;
    inv[2] = (m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6]) * invDet;
    inv[3] = (-m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6]) * invDet;
    inv[4] = (-m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10]) * invDet;
    inv[5] = (m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10]) * invDet;
    inv[6] = (-m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6]) * invDet;
    inv[7] = (m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6]) * invDet;
    inv[8] = (m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9]) * invDet;
    inv[9] = (-m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9]) * invDet;
    inv[10] = (m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5]) * invDet;
    inv[11] = (-m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5]) * invDet;
    inv[12] = (-m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9]) * invDet;
    inv[13] = (m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9]) * invDet;
    inv[14] = (-m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5]) * invDet;
    inv[15] = (m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5]) * invDet;

    return inv;
}

const BlendMode = {
    NORMAL: 'normal',
    ADDITIVE: 'additive',
    NO_BLENDING: 'no_blending',
    MULTIPLY_BLENDING: 'multiply',
};

class Shape2D {
    constructor({
        vertices = null,
        indices = null,
        texCoords = null,
        texture = null,
        color = new Color(1, 1, 1, 1),
        position = new Vector2(0, 0),
        rotation = 0,
        scale = new Vector2(1, 1),
        zIndex = 0,
        blendMode = BlendMode.NORMAL,
        isStroke = false,
        glowStrength = 0,
        blurStrength = 0,
    }) {
        this.vertices = vertices;
        this.indices = indices;
        this.texCoords = texCoords;
        this.texture = texture;
        this.color = color.clone();
        this.position = position.clone();
        this.rotation = rotation;
        this.scale = scale.clone();
        this.zIndex = zIndex;
        this.blendMode = blendMode;
        this.isStroke = isStroke;
        this.glowStrength = glowStrength;
        this.blurStrength = blurStrength;

        // GPU buffers
        this._vbo = null;
        this._texCoordVbo = null;
        this._ibo = null;
        this._vertexCount = 0;
    }

    setScale(scaleX, scaleY) {
        this.scale.set(scaleX, scaleY);
    }

    setAlpha(alpha) {
        this.color.a = alpha;
    }
}

class InstancedGroup {
    constructor({ baseGeometry, maxInstances = 10000, zIndex = 0, blendMode = BlendMode.NORMAL, texture = null }) {
        this.baseGeometry = baseGeometry;
        this.maxInstances = maxInstances;
        this.zIndex = zIndex;
        this.blendMode = blendMode;
        this.texture = texture;

        // number of floats per instance (now includes glowStrength and blurStrength)
        this.instanceStrideFloats = 11;
        this.instanceData = new Float32Array(maxInstances * this.instanceStrideFloats);
        this.instanceCount = 0;

        // GPU buffer
        this._instanceBuffer = null;
        this._vao = null;
    }

    clear() {
        this.instanceCount = 0;
    }

    getInstanceCount() {
        return this.instanceCount;
    }
    addInstance(pos, rotation, scale, color, glowStrength = 0, blurStrength = 0) {
        const i = this.instanceCount;
        if (i >= this.maxInstances) return;
        const base = i * this.instanceStrideFloats;
        this.instanceData[base + 0] = pos.x;
        this.instanceData[base + 1] = pos.y;
        this.instanceData[base + 2] = rotation;
        this.instanceData[base + 3] = scale.x;
        this.instanceData[base + 4] = scale.y;
        this.instanceData[base + 5] = color.r;
        this.instanceData[base + 6] = color.g;
        this.instanceData[base + 7] = color.b;
        this.instanceData[base + 8] = color.a;
        this.instanceData[base + 9] = glowStrength;
        this.instanceData[base + 10] = blurStrength;
        this.instanceCount++;
    }

    addInstanceRaw(posX, posY, rotation, scaleX, scaleY, colorR, colorG, colorB, colorA, glowStrength = 0, blurStrength = 0) {
        const i = this.instanceCount;
        if (i >= this.maxInstances) return;
        const base = i * this.instanceStrideFloats;
        this.instanceData[base + 0] = posX;
        this.instanceData[base + 1] = posY;
        this.instanceData[base + 2] = rotation;
        this.instanceData[base + 3] = scaleX;
        this.instanceData[base + 4] = scaleY;
        this.instanceData[base + 5] = colorR;
        this.instanceData[base + 6] = colorG;
        this.instanceData[base + 7] = colorB;
        this.instanceData[base + 8] = colorA;
        this.instanceData[base + 9] = glowStrength;
        this.instanceData[base + 10] = blurStrength;
        this.instanceCount++;
    }

    removeInstance(index) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }

        const lastIndex = this.instanceCount - 1;

        //swap with last instance

        if (index !== lastIndex) {
            const targetBase = index * this.instanceStrideFloats;
            const lastBase = lastIndex * this.instanceStrideFloats;

            this.instanceData[targetBase + 0] = this.instanceData[lastBase + 0];
            this.instanceData[targetBase + 1] = this.instanceData[lastBase + 1];

            this.instanceData[targetBase + 2] = this.instanceData[lastBase + 2];

            this.instanceData[targetBase + 3] = this.instanceData[lastBase + 3];
            this.instanceData[targetBase + 4] = this.instanceData[lastBase + 4];

            this.instanceData[targetBase + 5] = this.instanceData[lastBase + 5];
            this.instanceData[targetBase + 6] = this.instanceData[lastBase + 6];
            this.instanceData[targetBase + 7] = this.instanceData[lastBase + 7];
            this.instanceData[targetBase + 8] = this.instanceData[lastBase + 8];
            this.instanceData[targetBase + 9] = this.instanceData[lastBase + 9];
            this.instanceData[targetBase + 10] = this.instanceData[lastBase + 10];
        }

        const base = lastIndex * this.instanceStrideFloats;
        this.instanceData[base + 0] = 0;
        this.instanceData[base + 1] = 0;
        this.instanceData[base + 2] = 0;
        this.instanceData[base + 3] = 0;
        this.instanceData[base + 4] = 0;
        this.instanceData[base + 5] = 0;
        this.instanceData[base + 6] = 0;
        this.instanceData[base + 7] = 0;
        this.instanceData[base + 8] = 0;
        this.instanceData[base + 9] = 0;
        this.instanceData[base + 10] = 0;

        this.instanceCount--;
    }


    updateInstancePosition(index, x, y) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }
        const base = index * this.instanceStrideFloats;
        this.instanceData[base + 0] = x;
        this.instanceData[base + 1] = y;
    }

    updateInstanceRotation(index, rotation) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }
        const base = index * this.instanceStrideFloats;
        this.instanceData[base + 2] = rotation;
    }

    updateInstanceScale(index, scaleX, scaleY) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }
        const base = index * this.instanceStrideFloats;
        this.instanceData[base + 3] = scaleX;
        this.instanceData[base + 4] = scaleY;
    }

    updateInstanceColor(index, colorR, colorG, colorB, colorA) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }
        const base = index * this.instanceStrideFloats + 5;
        this.instanceData[base] = colorR;
        this.instanceData[base + 1] = colorG;
        this.instanceData[base + 2] = colorB;
        this.instanceData[base + 3] = colorA;
    }

    moveInstance(index, deltaX, deltaY) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }

        const base = index * this.instanceStrideFloats;
        this.instanceData[base + 0] += deltaX;
        this.instanceData[base + 1] += deltaY;
    }

    rotateInstance(index, delta) {
        if (index < 0 || index >= this.instanceCount) {
            console.warn('Instance index out of bounds');
            return;
        }

        const base = index * this.instanceStrideFloats;
        this.instanceData[base + 2] += delta;
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

        this.textures = new Map();
        this.whiteTexture = null;

        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraZoom = 1.0;
        this.usePostProcessing = (opts.usePostProcessing !== undefined) ? opts.usePostProcessing : false;
        
        const gl = this.gl;

        this.dummyTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
            1, 1, 0,
            gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([255, 255, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this._createWhiteTexture();

        this.normalProgram = this._initProgram(this._normalVS(), this._normalFS());
        this.a_position_Normal = gl.getAttribLocation(this.normalProgram, 'a_position');
        this.a_texCoord_Normal = gl.getAttribLocation(this.normalProgram, 'a_texCoord');
        this.u_matrix_Normal = gl.getUniformLocation(this.normalProgram, 'u_matrix');
        this.u_color_Normal = gl.getUniformLocation(this.normalProgram, 'u_color');
        this.u_texture_Normal = gl.getUniformLocation(this.normalProgram, 'u_texture');
        this.u_useTexture_Normal = gl.getUniformLocation(this.normalProgram, 'u_useTexture'); this.instancedProgram = this._initProgram(this._instancedVS(), this._instancedFS());
        this.a_position_Inst = gl.getAttribLocation(this.instancedProgram, 'a_position');
        this.a_texCoord_Inst = gl.getAttribLocation(this.instancedProgram, 'a_texCoord');
        this.a_offset_Inst = gl.getAttribLocation(this.instancedProgram, 'a_offset');
        this.a_rotation_Inst = gl.getAttribLocation(this.instancedProgram, 'a_rotation');
        this.a_scale_Inst = gl.getAttribLocation(this.instancedProgram, 'a_scale');
        this.a_color_Inst = gl.getAttribLocation(this.instancedProgram, 'a_color');
        this.a_glowStrength_Inst = gl.getAttribLocation(this.instancedProgram, 'a_glowStrength');
        this.a_blurStrength_Inst = gl.getAttribLocation(this.instancedProgram, 'a_blurStrength');
        this.u_proj_Inst = gl.getUniformLocation(this.instancedProgram, 'u_proj');
        this.u_texture_Inst = gl.getUniformLocation(this.instancedProgram, 'u_texture');
        this.u_useTexture_Inst = gl.getUniformLocation(this.instancedProgram, 'u_useTexture');
        this.u_isEmissivePass_Inst = gl.getUniformLocation(this.instancedProgram, 'u_isEmissivePass');

        // Post-processing programs
        this.emissiveProgram = this._initProgram(this._emissiveVS(), this._emissiveFS());
        this.u_sceneTexture_Emissive = gl.getUniformLocation(this.emissiveProgram, 'u_sceneTexture');

        this.blurProgram = this._initProgram(this._blurVS(), this._blurFS());
        this.u_texture_Blur = gl.getUniformLocation(this.blurProgram, 'u_texture');
        this.u_texelOffset_Blur = gl.getUniformLocation(this.blurProgram, 'u_texelOffset');

        this.compositeProgram = this._initProgram(this._emissiveVS(), this._compositeFS());
        this.u_sceneTexture_Composite = gl.getUniformLocation(this.compositeProgram, 'u_sceneTexture');
        this.u_bloomTexture_Composite = gl.getUniformLocation(this.compositeProgram, 'u_bloomTexture');
        this.u_globalBlurStrength_Composite = gl.getUniformLocation(this.compositeProgram, 'u_globalBlurStrength');

        this.virtualWidth = opts.virtualWidth || 1920;
        this.virtualHeight = opts.virtualHeight || 1080;
        this.scaleFactor = 1.0;

        if (this.usePostProcessing) {
            this._initPostProcessing();
        } else {
            this.postProcessingInitialized = false;
        }

        this.FLOAT_FMT = gl.RGBA16F;           // internal format
        const FLOAT_TYP = gl.HALF_FLOAT;        // data type (WebGL2 constant)
    }

    _createWhiteTexture() {
        const gl = this.gl;
        this.whiteTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.whiteTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    async loadTexture(url, name = null) {
        const textureName = name || url;

        if (this.textures.has(textureName)) {
            return this.textures.get(textureName);
        }

        return new Promise((resolve, reject) => {
            const gl = this.gl;
            const texture = gl.createTexture();
            const image = new Image();

            image.onload = () => {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

                const isPowerOf2 = (value) => (value & (value - 1)) === 0;
                if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                } else {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                }
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

                const textureInfo = {
                    texture: texture,
                    width: image.width,
                    height: image.height
                };

                this.textures.set(textureName, textureInfo);
                resolve(textureInfo);
            };

            image.onerror = () => {
                reject(new Error(`Failed to load texture: ${url}`));
            };

            image.crossOrigin = 'anonymous';
            image.src = url;
        });
    }

    getTexture(name) {
        return this.textures.get(name);
    }

    _hexToRgbA(hex) {
        if (!hex || typeof hex !== 'string') {
            return { r: 0, g: 0, b: 0, a: 1 };
        }

        let r = 0, g = 0, b = 0, a = 1;
        let processedHex = hex.startsWith('#') ? hex.slice(1) : hex;

        if (processedHex.length === 3) { // #RGB
            r = parseInt(processedHex[0] + processedHex[0], 16);
            g = parseInt(processedHex[1] + processedHex[1], 16);
            b = parseInt(processedHex[2] + processedHex[2], 16);
        } else if (processedHex.length === 4) { // #RGBA
            r = parseInt(processedHex[0] + processedHex[0], 16);
            g = parseInt(processedHex[1] + processedHex[1], 16);
            b = parseInt(processedHex[2] + processedHex[2], 16);
            a = parseInt(processedHex[3] + processedHex[3], 16);
        } else if (processedHex.length === 6) { // #RRGGBB
            r = parseInt(processedHex.substring(0, 2), 16);
            g = parseInt(processedHex.substring(2, 4), 16);
            b = parseInt(processedHex.substring(4, 6), 16);
        } else if (processedHex.length === 8) { // #RRGGBBAA
            r = parseInt(processedHex.substring(0, 2), 16);
            g = parseInt(processedHex.substring(2, 4), 16);
            b = parseInt(processedHex.substring(4, 6), 16);
            a = parseInt(processedHex.substring(6, 8), 16);
        } else {
            // console.warn(`Invalid hex color string format: #${processedHex}. Using default black.`);
            return { r: 0, g: 0, b: 0, a: 1 };
        }

        return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
    }

    setCamera({ x = 0, y = 0, zoom = 1.0 }) {
        this.cameraX = x;
        this.cameraY = y;
        this.cameraZoom = zoom;
        this._updateProjectionMatrix();
    }

    _updateProjectionMatrix() {
        const dpr = window.devicePixelRatio || 1;
        const physicalWidth = this.canvas.clientWidth * dpr;
        const physicalHeight = this.canvas.clientHeight * dpr;

        this.scaleFactor = physicalHeight / this.virtualHeight;

        const viewWidth = physicalWidth / this.scaleFactor;
        const viewHeight = physicalHeight / this.scaleFactor;

        const left = this.cameraX - viewWidth / 2 / this.cameraZoom;
        const right = this.cameraX + viewWidth / 2 / this.cameraZoom;
        const bottom = this.cameraY - viewHeight / 2 / this.cameraZoom;
        const top = this.cameraY + viewHeight / 2 / this.cameraZoom;

        this._projectionMatrix = this._makeOrtho(left, right, bottom, top, -1, 1);
        this._inverseProjectionMatrix = invertMatrix(this._projectionMatrix);
    }

    createNormalShape(params) {
        const shape = new Shape2D(params);
        this._uploadShapeBuffers(shape);
        this.normalShapes.push(shape);
        return shape;
    }

    updateNormalShape(shape, changes) {
        let reuploadVerts = false,
            reuploadIdx = false,
            reuploadTexCoords = false;
        if (changes.vertices !== undefined) {
            shape.vertices = changes.vertices;
            reuploadVerts = true;
        }
        if (changes.indices !== undefined) {
            shape.indices = changes.indices;
            reuploadIdx = true;
        }
        if (changes.texCoords !== undefined) {
            shape.texCoords = changes.texCoords;
            reuploadTexCoords = true;
        }
        if (changes.texture !== undefined) shape.texture = changes.texture;
        if (changes.color !== undefined) shape.color = changes.color.clone();
        if (changes.position !== undefined) shape.position = changes.position.clone();
        if (changes.rotation !== undefined) shape.rotation = changes.rotation;
        if (changes.scale !== undefined) shape.scale = changes.scale.clone();
        if (changes.zIndex !== undefined) shape.zIndex = changes.zIndex;
        if (changes.blendMode !== undefined) shape.blendMode = changes.blendMode;
        if (changes.isStroke !== undefined) shape.isStroke = changes.isStroke;

        if (reuploadVerts) this._uploadShapeVertices(shape);
        if (reuploadIdx) this._uploadShapeIndices(shape);
        if (reuploadTexCoords) this._uploadShapeTexCoords(shape);
    }

    removeNormalShape(shape) {
        const idx = this.normalShapes.indexOf(shape);
        if (idx >= 0) this.normalShapes.splice(idx, 1);
        if (shape._vbo) {
            this.gl.deleteBuffer(shape._vbo);
            shape._vbo = null;
        }
        if (shape._texCoordVbo) {
            this.gl.deleteBuffer(shape._texCoordVbo);
            shape._texCoordVbo = null;
        }
        if (shape._ibo) {
            this.gl.deleteBuffer(shape._ibo);
            shape._ibo = null;
        }
    }

    createInstancedGroup({ vertices, indices, texCoords = null, texture = null, maxInstances = 10000, zIndex = 0, blendMode = BlendMode.NORMAL }) {
        const gl = this.gl;
        const baseGeom = {};
        baseGeom.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, baseGeom.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        baseGeom.numVerts = vertices.length / 2;

        if (texCoords) {
            baseGeom.texCoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, baseGeom.texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
        } else {
            baseGeom.texCoordBuffer = null;
        }

        if (indices) {
            baseGeom.indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, baseGeom.indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            baseGeom.numIndices = indices.length;
        } else {
            baseGeom.indexBuffer = null;
            baseGeom.numIndices = 0;
        }

        const group = new InstancedGroup({ baseGeometry: baseGeom, maxInstances, zIndex, blendMode, texture });
        group._instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, group._instanceBuffer);
        const totalBytes = maxInstances * 11 * 4; // Updated for 11 floats per instance
        gl.bufferData(gl.ARRAY_BUFFER, totalBytes, gl.DYNAMIC_DRAW);

        group._vao = gl.createVertexArray();
        gl.bindVertexArray(group._vao);

        //  position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, baseGeom.vertexBuffer);
        gl.enableVertexAttribArray(this.a_position_Inst);
        gl.vertexAttribPointer(this.a_position_Inst, 2, gl.FLOAT, false, 0, 0);

        //  texture coordinate buffer
        if (baseGeom.texCoordBuffer && this.a_texCoord_Inst !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, baseGeom.texCoordBuffer);
            gl.enableVertexAttribArray(this.a_texCoord_Inst);
            gl.vertexAttribPointer(this.a_texCoord_Inst, 2, gl.FLOAT, false, 0, 0);
        }

        if (baseGeom.indexBuffer) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, baseGeom.indexBuffer);
        }

        // instance buffer => offset(2), rotation(1), scale(2), color(4), glowStrength(1), blurStrength(1)
        gl.bindBuffer(gl.ARRAY_BUFFER, group._instanceBuffer);
        const stride = 11 * 4; 
        // offset => loc= a_offset_Inst (location 2)
        gl.enableVertexAttribArray(this.a_offset_Inst);
        gl.vertexAttribPointer(this.a_offset_Inst, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(this.a_offset_Inst, 1);

        // rotation => a_rotation_Inst (location 3)
        gl.enableVertexAttribArray(this.a_rotation_Inst);
        gl.vertexAttribPointer(this.a_rotation_Inst, 1, gl.FLOAT, false, stride, 2 * 4);
        gl.vertexAttribDivisor(this.a_rotation_Inst, 1);

        // scale => a_scale_Inst (location 4)
        gl.enableVertexAttribArray(this.a_scale_Inst);
        gl.vertexAttribPointer(this.a_scale_Inst, 2, gl.FLOAT, false, stride, 3 * 4);
        gl.vertexAttribDivisor(this.a_scale_Inst, 1);

        // color => a_color_Inst (location 5)
        gl.enableVertexAttribArray(this.a_color_Inst);
        gl.vertexAttribPointer(this.a_color_Inst, 4, gl.FLOAT, false, stride, 5 * 4);
        gl.vertexAttribDivisor(this.a_color_Inst, 1);

        // glowStrength => a_glowStrength_Inst (location 6)
        gl.enableVertexAttribArray(this.a_glowStrength_Inst);
        gl.vertexAttribPointer(this.a_glowStrength_Inst, 1, gl.FLOAT, false, stride, 9 * 4);
        gl.vertexAttribDivisor(this.a_glowStrength_Inst, 1);

        // blurStrength => a_blurStrength_Inst (location 7)
        gl.enableVertexAttribArray(this.a_blurStrength_Inst);
        gl.vertexAttribPointer(this.a_blurStrength_Inst, 1, gl.FLOAT, false, stride, 10 * 4);
        gl.vertexAttribDivisor(this.a_blurStrength_Inst, 1); gl.bindVertexArray(null);

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
            if (group.baseGeometry.texCoordBuffer) {
                gl.deleteBuffer(group.baseGeometry.texCoordBuffer);
                group.baseGeometry.texCoordBuffer = null;
            }
            if (group.baseGeometry.indexBuffer) {
                gl.deleteBuffer(group.baseGeometry.indexBuffer);
                group.baseGeometry.indexBuffer = null;
            }
        }
    }

    drawFrame() {
        this._resizeIfNeeded();
        if (!this.usePostProcessing) {
            this._drawFrameDirect();
            return;
        }

        try {
            this._drawFrameWithPostProcessing();
        } catch (error) {
            console.error('Post-processing failed, falling back to direct rendering:', error);
            this._drawFrameDirect();
        }
    }

    _drawFrameWithPostProcessing() {
        if (!this.postProcessingInitialized) {
            this._resizePostProcessingBuffers();
            if (!this.postProcessingInitialized) {
                throw new Error('Failed to initialize post-processing');
            }
        }

        const gl = this.gl;
        this._updateProjectionMatrix();

        const items = [];
        for (const sh of this.normalShapes) {
            items.push({ type: 'normal', data: sh, zIndex: sh.zIndex, blend: sh.blendMode });
        }
        for (const grp of this.instancedGroups) {
            items.push({ type: 'instanced', data: grp, zIndex: grp.zIndex, blend: grp.blendMode });
        }
        items.sort((a, b) => a.zIndex - b.zIndex);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        let renderCount = 0;
        for (const item of items) {
            if (item.type === 'normal') {
                this._drawNormalShape(item.data);
                renderCount++;
            } else {
                this._drawInstancedGroup(item.data);
                renderCount++;
            }
        }

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Scene framebuffer is not complete!');
        }
        // PASS 1: Render emissive to emiTex (half-res)  
        const halfWidth = Math.max(1, Math.floor(this.canvas.width / 2));
        const halfHeight = Math.max(1, Math.floor(this.canvas.height / 2));

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.emissiveFBO);
        gl.viewport(0, 0, halfWidth, halfHeight);
        gl.clearColor(0, 0, 0, 0); // Clear to transparent
        gl.clear(gl.COLOR_BUFFER_BIT);

        let emissiveCount = 0;
        // Render ONLY objects with glow > 0 
        for (const item of items) {
            if (item.type === 'instanced') {
                // Check if any instances in this group have glow > 0
                let hasGlow = false;
                const group = item.data;
                for (let i = 0; i < group.instanceCount; i++) {
                    const base = i * group.instanceStrideFloats;
                    const glowStrength = group.instanceData[base + 9]; // glow at offset 9
                    if (glowStrength > 0) {
                        hasGlow = true;
                        break;
                    }
                }
                if (hasGlow) {
                    this._drawEmissiveInstancedGroup(item.data);
                    emissiveCount++;
                }
            }
            // Note: Normal shapes don't have glow strength yet, so skip them
        }

        // PASS 2: Blur the emissive texture (ping-pong at half-res)
        this._performBlurPasses();

        // PASS 3: Composite final image
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.disable(gl.BLEND);
        gl.useProgram(this.compositeProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(this.u_sceneTexture_Composite, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexture2); // Final blurred result
        gl.uniform1i(this.u_bloomTexture_Composite, 1);

        gl.uniform1f(this.u_globalBlurStrength_Composite, 1.0); // Enable global blur for testing

        gl.bindVertexArray(this.fullScreenTriangleVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.enable(gl.BLEND);
    }

    _drawFrameDirect() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        this._updateProjectionMatrix();

        const items = [];
        for (const sh of this.normalShapes) {
            items.push({ type: 'normal', data: sh, zIndex: sh.zIndex, blend: sh.blendMode });
        }
        for (const grp of this.instancedGroups) {
            items.push({ type: 'instanced', data: grp, zIndex: grp.zIndex, blend: grp.blendMode });
        }
        items.sort((a, b) => a.zIndex - b.zIndex);

        for (const item of items) {
            if (item.type === 'normal') {
                this._drawNormalShape(item.data);
            } else {
                this._drawInstancedGroup(item.data);
            }
        }
    }

    screenToCanvas(eventX, eventY) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = eventX - rect.left;
        const mouseY = eventY - rect.top;

        const css_to_world_ratio = this.virtualHeight / this.canvas.clientHeight;

        const worldX = this.cameraX + (mouseX - this.canvas.clientWidth / 2) * css_to_world_ratio / this.cameraZoom;
        const worldY = this.cameraY - (mouseY - this.canvas.clientHeight / 2) * css_to_world_ratio / this.cameraZoom;

        return new Vector2(worldX, worldY);
    }

    worldToScreen(wx, wy) {
        const rect              = this.canvas.getBoundingClientRect();
    
        const cssToWorld        = this.virtualHeight / this.canvas.clientHeight;
    
        const sx = (wx - this.cameraX) * this.cameraZoom / cssToWorld +
                   this.canvas.clientWidth  / 2 + rect.left;
    
        const sy = (this.cameraY - wy) * this.cameraZoom / cssToWorld +
                   this.canvas.clientHeight / 2 + rect.top;
    
        return { x: sx, y: sy };
    }

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

        const model = this._computeModelMatrix(shape.position, shape.rotation, shape.scale);
        const mvp = this._multiplyMat4(this._projectionMatrix, model);

        gl.uniformMatrix4fv(this.u_matrix_Normal, false, mvp);
        gl.uniform4fv(this.u_color_Normal, shape.color.toArray());

        // Handle texture
        const useTexture = shape.texture !== null;
        gl.uniform1i(this.u_useTexture_Normal, useTexture);

        if (useTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, shape.texture.texture);
            gl.uniform1i(this.u_texture_Normal, 0);
        }
        else {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);
            gl.uniform1i(this.u_texture_Normal, 0);
        }

        // bind shape buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, shape._vbo);
        gl.enableVertexAttribArray(this.a_position_Normal);
        gl.vertexAttribPointer(this.a_position_Normal, 2, gl.FLOAT, false, 0, 0);

        // bind texture coordinates if available
        if (shape._texCoordVbo && this.a_texCoord_Normal !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, shape._texCoordVbo);
            gl.enableVertexAttribArray(this.a_texCoord_Normal);
            gl.vertexAttribPointer(this.a_texCoord_Normal, 2, gl.FLOAT, false, 0, 0);
        } else if (this.a_texCoord_Normal !== -1) {
            gl.disableVertexAttribArray(this.a_texCoord_Normal);
        }

        if (shape.indices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape._ibo);
            const drawMode = shape.isStroke ? gl.LINES : gl.TRIANGLES;
            gl.drawElements(drawMode, shape.indices.length, gl.UNSIGNED_SHORT, 0);
        } else {
            const drawMode = shape.isStroke ? gl.LINES : gl.TRIANGLES;
            gl.drawArrays(drawMode, 0, shape._vertexCount);
        }
    }


    _drawInstancedGroup(group) {
        const gl = this.gl;
        if (group.instanceCount <= 0) return;

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
        }        gl.useProgram(this.instancedProgram);

        // Handle texture
        const useTexture = group.texture !== null;
        gl.uniform1i(this.u_useTexture_Inst, useTexture);
        gl.uniform1i(this.u_isEmissivePass_Inst, 0);

        if (useTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, group.texture.texture);
            gl.uniform1i(this.u_texture_Inst, 0);
        }
        else {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);          
            gl.uniform1i(this.u_texture_Inst, 0);
        }
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

    _drawEmissiveInstancedGroup(group) {
        const gl = this.gl;
        if (group.instanceCount <= 0) return;

        let hasEmissiveInstances = false;
        for (let i = 0; i < group.instanceCount; i++) {
            const base = i * group.instanceStrideFloats;
            if (group.instanceData[base + 9] > 0) {
                hasEmissiveInstances = true;
                break;
            }
        }

        if (!hasEmissiveInstances) return;

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

        gl.useProgram(this.instancedProgram);

        const useTexture = group.texture !== null;
        gl.uniform1i(this.u_useTexture_Inst, useTexture);
        gl.uniform1i(this.u_isEmissivePass_Inst, 1);

        if (useTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, group.texture.texture);
            gl.uniform1i(this.u_texture_Inst, 0);
        }

        gl.uniformMatrix4fv(this.u_proj_Inst, false, this._projectionMatrix);

        // Create filtered instance data with only emissive instances
        const filteredData = new Float32Array(group.instanceCount * group.instanceStrideFloats);
        let filteredCount = 0;

        for (let i = 0; i < group.instanceCount; i++) {
            const base = i * group.instanceStrideFloats;
            const glowStrength = group.instanceData[base + 9];

            if (glowStrength > 0) {
                const filteredBase = filteredCount * group.instanceStrideFloats;
                for (let j = 0; j < group.instanceStrideFloats; j++) {
                    filteredData[filteredBase + j] = group.instanceData[base + j];
                }

                filteredCount++;
            }
        }

        if (filteredCount === 0) return;

        // Update instance buffer with filtered data
        gl.bindBuffer(gl.ARRAY_BUFFER, group._instanceBuffer);
        const subData = filteredData.subarray(0, filteredCount * group.instanceStrideFloats);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, subData);

        // Bind VAO
        gl.bindVertexArray(group._vao);

        if (group.baseGeometry.numIndices > 0) {
            gl.drawElementsInstanced(
                gl.TRIANGLES,
                group.baseGeometry.numIndices,
                gl.UNSIGNED_SHORT,
                0,
                filteredCount
            );
        } else {
            gl.drawArraysInstanced(
                gl.TRIANGLES,
                0,
                group.baseGeometry.numVerts,
                filteredCount
            );
        }

        gl.bindVertexArray(null);

        // Reset blend mode back to normal
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    _performBlurPasses() {
        const gl = this.gl;
        const halfWidth = Math.max(1, Math.floor(this.canvas.width / 2));
        const halfHeight = Math.max(1, Math.floor(this.canvas.height / 2));

        gl.useProgram(this.blurProgram);
        gl.bindVertexArray(this.fullScreenTriangleVAO);

        // Horizontal blur: emissive -> blur1
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1);
        gl.viewport(0, 0, halfWidth, halfHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.emissiveTexture);
        gl.uniform1i(this.u_texture_Blur, 0);
        gl.uniform2f(this.u_texelOffset_Blur, 1.0 / halfWidth, 0.0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Vertical blur: blur1 -> blur2
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO2);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.bindTexture(gl.TEXTURE_2D, this.blurTexture1);
        gl.uniform2f(this.u_texelOffset_Blur, 0.0, 1.0 / halfHeight);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindVertexArray(null);
    }

    _normalVS() {
        return `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        uniform mat4 u_matrix;
        varying vec2 v_texCoord;
        void main(){
            gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }
        `;
    }
    _normalFS() {
        return `
        precision mediump float;
        uniform vec4 u_color;
        uniform sampler2D u_texture;
        uniform bool u_useTexture;
        varying vec2 v_texCoord;
        void main(){
            if (u_useTexture) {
                vec4 texColor = texture2D(u_texture, v_texCoord);
                gl_FragColor = texColor * u_color;
            } else {
                gl_FragColor = u_color;
            }
        }
        `;
    } _instancedVS() {
        return `#version 300 es
        layout(location=0) in vec2 a_position; 
        layout(location=1) in vec2 a_texCoord;
        layout(location=2) in vec2 a_offset; 
        layout(location=3) in float a_rotation;
        layout(location=4) in vec2 a_scale;
        layout(location=5) in vec4 a_color;
        layout(location=6) in float a_glowStrength;
        layout(location=7) in float a_blurStrength;

        uniform mat4 u_proj;

        out vec4 v_color;
        out vec2 v_uv;
        out float v_glowStrength;
        out float v_blurStrength;

        void main(){
            v_uv = a_texCoord;
            v_glowStrength = a_glowStrength;
            v_blurStrength = a_blurStrength;
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
    } _instancedFS() {
        return `#version 300 es
        precision mediump float;

        in  vec4  v_color;
        in  vec2  v_uv;
        in  float v_glowStrength;
        in  float v_blurStrength;

        uniform sampler2D u_texture;
        uniform bool      u_useTexture;
        uniform bool      u_isEmissivePass;   

        out vec4 outColor;

        void main() {
            vec4 base = u_useTexture ? texture(u_texture, v_uv) * v_color
                                    : v_color;

            if (u_isEmissivePass) {
                // scale by both controls; >1.0 perfectly OK
                base.rgb *= v_glowStrength * v_blurStrength;
                // Alpha can stay as-is so bloom inherits original opacity
            }

            outColor = base;
        }
        `;
    }

    // Post-processing shaders
    _emissiveVS() {
        return `#version 300 es
        layout(location=0) in vec2 a_position;
        
        out vec2 v_uv;
        
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
        `;
    } _emissiveFS() {
        return `#version 300 es
        precision mediump float;
        
        in vec2 v_uv;
        
        uniform sampler2D u_sceneTexture;
        
        out vec4 outColor;
        
        void main() {
            vec4 sceneColor = texture(u_sceneTexture, v_uv);
            
            // For emissive pass, we want to downscale the scene texture to half resolution
            // This will be filled with emissive content by the main rendering
            outColor = sceneColor;
        }
        `;
    }

    _blurVS() {
        return `#version 300 es
        layout(location=0) in vec2 a_position;
        
        out vec2 v_uv;
        
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
        `;
    }

    _blurFS() {
        return `#version 300 es
        precision mediump float;
        
        in vec2 v_uv;
        
        uniform sampler2D u_texture;
        uniform vec2 u_texelOffset;
        
        out vec4 outColor;
        
        void main() {
            // 9-tap Gaussian blur kernel weights
            float weights[9];
            weights[0] = 0.013519; weights[1] = 0.047662; weights[2] = 0.118318;
            weights[3] = 0.205065; weights[4] = 0.231126; weights[5] = 0.205065;
            weights[6] = 0.118318; weights[7] = 0.047662; weights[8] = 0.013519;
            
            vec3 color = vec3(0.0);
            float alpha = 0.0;
              for (int i = 0; i < 9; i++) {
                vec2 offset = u_texelOffset * float(i - 4);
                vec4 texSample = texture(u_texture, v_uv + offset);
                color += texSample.rgb * weights[i];
                alpha += texSample.a * weights[i];
            }
            
            outColor = vec4(color, alpha);
        }
        `;
    } _compositeFS() {
        return `#version 300 es
        precision mediump float;

        in  vec2 v_uv;
        uniform sampler2D u_sceneTexture;    // full-res
        uniform sampler2D u_bloomTexture;    // half-res, already blurred
        uniform float     u_globalBlurStrength; // 0-1 (optional, keep for future)

        out vec4 outColor;

        void main() {
            vec3 scene  = texture(u_sceneTexture, v_uv).rgb;
            vec3 bloom  = texture(u_bloomTexture, v_uv).rgb;

            // tone-map or clamp if you wish
            vec3 colour = scene + bloom * 20.0;                 // simple additive output

            outColor = vec4(colour, 1.0);                // alpha forced to 1
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
        const [sx, sy] = [scl.x, scl.y];
        const [px, py] = [pos.x, pos.y];
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
    _resizeIfNeeded() {
        const gl = this.gl;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(this.canvas.clientWidth * dpr);
        const height = Math.floor(this.canvas.clientHeight * dpr);

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this._updateProjectionMatrix();

            // Resize post-processing buffers when canvas size changes
            if (this.postProcessingInitialized) {
                this._resizePostProcessingBuffers();
            }
        }
    }

    _initPostProcessing() {
        const gl = this.gl;

        // Create full-screen triangle for post-processing
        this.fullScreenTriangleVAO = gl.createVertexArray();
        gl.bindVertexArray(this.fullScreenTriangleVAO);

        const fullScreenVerts = new Float32Array([
            -1, -1,   // bottom-left
            3, -1,   // bottom-right (extends past screen)
            -1, 3    // top-left (extends past screen)
        ]);

        this.fullScreenVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fullScreenVBO);
        gl.bufferData(gl.ARRAY_BUFFER, fullScreenVerts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        // Will be initialized properly in _resizePostProcessingBuffers
        this.sceneFBO = null;
        this.sceneTexture = null;
        this.emissiveFBO = null;
        this.emissiveTexture = null;
        this.blurFBO1 = null;
        this.blurTexture1 = null;
        this.blurFBO2 = null;
        this.blurTexture2 = null;

        this.postProcessingInitialized = false;
    }

    _resizePostProcessingBuffers() {
        const gl = this.gl;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const halfWidth = Math.max(1, Math.floor(width / 2));
        const halfHeight = Math.max(1, Math.floor(height / 2));

        // Clean up existing buffers
        if (this.sceneFBO) {
            gl.deleteFramebuffer(this.sceneFBO);
            gl.deleteTexture(this.sceneTexture);
            gl.deleteFramebuffer(this.emissiveFBO);
            gl.deleteTexture(this.emissiveTexture);
            gl.deleteFramebuffer(this.blurFBO1);
            gl.deleteTexture(this.blurTexture1);
            gl.deleteFramebuffer(this.blurFBO2);
            gl.deleteTexture(this.blurTexture2);
        }

        // Scene texture (full resolution)
        this.sceneTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.sceneFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);

        // Emissive texture (half resolution)
        this.emissiveTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.emissiveTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, halfWidth, halfHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.emissiveFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.emissiveFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.emissiveTexture, 0);

        // Blur textures (half resolution, ping-pong)
        this.blurTexture1 = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexture1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, halfWidth, halfHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.blurFBO1 = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture1, 0);

        this.blurTexture2 = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexture2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, halfWidth, halfHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.blurFBO2 = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture2, 0);

        // Check framebuffer completeness
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer not complete');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.postProcessingInitialized = true;
    }

    _doPostProcessing() {
        const gl = this.gl;
        const halfWidth = Math.max(1, Math.floor(this.canvas.width / 2));
        const halfHeight = Math.max(1, Math.floor(this.canvas.height / 2));

        // 1. Render scene to texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const sh of this.normalShapes) {
            this._drawNormalShape(sh);
        }
        for (const grp of this.instancedGroups) {
            this._drawInstancedGroup(grp);
        }

        // 2. Extract emissive parts
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.emissiveFBO);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.emissiveProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(this.u_sceneTexture_Emissive, 0);
        gl.bindVertexArray(this.fullScreenTriangleVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 3. Blur emissive parts
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.blurProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.emissiveTexture);
        gl.uniform1i(this.u_texture_Blur, 0);
        gl.uniform2f(this.u_texelOffset_Blur, 1.0 / halfWidth, 0.0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO2);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.blurProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexture1);
        gl.uniform1i(this.u_texture_Blur, 0);
        gl.uniform2f(this.u_texelOffset_Blur, 0.0, 1.0 / halfHeight);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 4. Composite scene and blurred emissive parts
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.compositeProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(this.u_sceneTexture_Composite, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexture2);
        gl.uniform1i(this.u_bloomTexture_Composite, 1);
        gl.uniform1f(this.u_globalBlurStrength_Composite, 1.0);
        gl.bindVertexArray(this.fullScreenTriangleVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Buffer upload methods for normal shapes
    _uploadShapeBuffers(shape) {
        this._uploadShapeVertices(shape);
        this._uploadShapeIndices(shape);
        this._uploadShapeTexCoords(shape);
    }

    _uploadShapeVertices(shape) {
        const gl = this.gl;
        if (!shape.vertices) return;

        if (!shape._vbo) {
            shape._vbo = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, shape._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, shape.vertices, gl.STATIC_DRAW);
        shape._vertexCount = shape.vertices.length / 2;
    }

    _uploadShapeIndices(shape) {
        const gl = this.gl;
        if (!shape.indices) return;

        if (!shape._ibo) {
            shape._ibo = gl.createBuffer();
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape._ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shape.indices, gl.STATIC_DRAW);
    }

    _uploadShapeTexCoords(shape) {
        const gl = this.gl;
        if (!shape.texCoords) return;

        if (!shape._texCoordVbo) {
            shape._texCoordVbo = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, shape._texCoordVbo);
        gl.bufferData(gl.ARRAY_BUFFER, shape.texCoords, gl.STATIC_DRAW);
    }
}

// https://github.com/mrdoob/three.js/blob/master/src/core/Clock.js
class Clock {
    constructor(autoStart = true) {
        this.autoStart = autoStart;
        this.startTime = 0;
        this.oldTime = 0;
        this.elapsedTime = 0;
        this.running = false;
    }

    start() {
        this.startTime = now();
        this.oldTime = this.startTime;
        this.elapsedTime = 0;
        this.running = true;
    }

    stop() {
        this.getElapsedTime();
        this.running = false;
        this.autoStart = false;
    }

    getElapsedTime() {
        this.getDelta();
        return this.elapsedTime;
    }

    getDelta() {
        let diff = 0;
        if (this.autoStart && !this.running) {
            this.start();
            return 0;
        }

        if (this.running) {
            const newTime = now();

            diff = (newTime - this.oldTime) / 1000;
            this.oldTime = newTime;

            this.elapsedTime += diff;
        }

        return diff;
    }
}

function now() {
    return performance.now();
}

export {
    Renderer2D,
    BlendMode,
    Clock,
    Vector2,
    Color,
    buildCircle,
    buildRing,
    buildStar,
    buildDroplet,
    buildHelix,
    buildPolygon,
    buildStrokeGeometry,
    buildTriangle,
    buildTexturedSquare,
    buildSliceBurst,
};
