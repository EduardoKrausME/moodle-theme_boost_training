/**
 * https://github.com/qrohlf/trianglify
 */

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
            (global = global || self, global.trianglify = factory());
}(this, (function () { 'use strict';

    const EPSILON = Math.pow(2, -52);
    const EDGE_STACK = new Uint32Array(512);
    class Delaunator {
        static from(points, getX = defaultGetX, getY = defaultGetY) {
            const n = points.length;
            const coords = new Float64Array(n * 2);

            for (let i = 0; i < n; i++) {
                const p = points[i];
                coords[2 * i] = getX(p);
                coords[2 * i + 1] = getY(p);
            }

            return new Delaunator(coords);
        }

        constructor(coords) {
            const n = coords.length >> 1;
            if (n > 0 && typeof coords[0] !== 'number') throw new Error('Expected coords to contain numbers.');
            this.coords = coords; // arrays that will store the triangulation graph

            const maxTriangles = Math.max(2 * n - 5, 0);
            this._triangles = new Uint32Array(maxTriangles * 3);
            this._halfedges = new Int32Array(maxTriangles * 3); // temporary arrays for tracking the edges of the advancing convex hull

            this._hashSize = Math.ceil(Math.sqrt(n));
            this._hullPrev = new Uint32Array(n); // edge to prev edge

            this._hullNext = new Uint32Array(n); // edge to next edge

            this._hullTri = new Uint32Array(n); // edge to adjacent triangle

            this._hullHash = new Int32Array(this._hashSize).fill(-1); // angular edge hash
            // temporary arrays for sorting points

            this._ids = new Uint32Array(n);
            this._dists = new Float64Array(n);
            this.update();
        }

        update() {
            const {
                coords,
                _hullPrev: hullPrev,
                _hullNext: hullNext,
                _hullTri: hullTri,
                _hullHash: hullHash
            } = this;
            const n = coords.length >> 1; // populate an array of point indices; calculate input data bbox

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            for (let i = 0; i < n; i++) {
                const x = coords[2 * i];
                const y = coords[2 * i + 1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                this._ids[i] = i;
            }

            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            let minDist = Infinity;
            let i0, i1, i2; // pick a seed point close to the center

            for (let i = 0; i < n; i++) {
                const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);

                if (d < minDist) {
                    i0 = i;
                    minDist = d;
                }
            }

            const i0x = coords[2 * i0];
            const i0y = coords[2 * i0 + 1];
            minDist = Infinity; // find the point closest to the seed

            for (let i = 0; i < n; i++) {
                if (i === i0) continue;
                const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);

                if (d < minDist && d > 0) {
                    i1 = i;
                    minDist = d;
                }
            }

            let i1x = coords[2 * i1];
            let i1y = coords[2 * i1 + 1];
            let minRadius = Infinity; // find the third point which forms the smallest circumcircle with the first two

            for (let i = 0; i < n; i++) {
                if (i === i0 || i === i1) continue;
                const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);

                if (r < minRadius) {
                    i2 = i;
                    minRadius = r;
                }
            }

            let i2x = coords[2 * i2];
            let i2y = coords[2 * i2 + 1];

            if (minRadius === Infinity) {
                // order collinear points by dx (or dy if all x are identical)
                // and return the list as a hull
                for (let i = 0; i < n; i++) {
                    this._dists[i] = coords[2 * i] - coords[0] || coords[2 * i + 1] - coords[1];
                }

                quicksort(this._ids, this._dists, 0, n - 1);
                const hull = new Uint32Array(n);
                let j = 0;

                for (let i = 0, d0 = -Infinity; i < n; i++) {
                    const id = this._ids[i];

                    if (this._dists[id] > d0) {
                        hull[j++] = id;
                        d0 = this._dists[id];
                    }
                }

                this.hull = hull.subarray(0, j);
                this.triangles = new Uint32Array(0);
                this.halfedges = new Uint32Array(0);
                return;
            } // swap the order of the seed points for counter-clockwise orientation


            if (orient(i0x, i0y, i1x, i1y, i2x, i2y)) {
                const i = i1;
                const x = i1x;
                const y = i1y;
                i1 = i2;
                i1x = i2x;
                i1y = i2y;
                i2 = i;
                i2x = x;
                i2y = y;
            }

            const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
            this._cx = center.x;
            this._cy = center.y;

            for (let i = 0; i < n; i++) {
                this._dists[i] = dist(coords[2 * i], coords[2 * i + 1], center.x, center.y);
            } // sort the points by distance from the seed triangle circumcenter


            quicksort(this._ids, this._dists, 0, n - 1); // set up the seed triangle as the starting hull

            this._hullStart = i0;
            let hullSize = 3;
            hullNext[i0] = hullPrev[i2] = i1;
            hullNext[i1] = hullPrev[i0] = i2;
            hullNext[i2] = hullPrev[i1] = i0;
            hullTri[i0] = 0;
            hullTri[i1] = 1;
            hullTri[i2] = 2;
            hullHash.fill(-1);
            hullHash[this._hashKey(i0x, i0y)] = i0;
            hullHash[this._hashKey(i1x, i1y)] = i1;
            hullHash[this._hashKey(i2x, i2y)] = i2;
            this.trianglesLen = 0;

            this._addTriangle(i0, i1, i2, -1, -1, -1);

            for (let k = 0, xp, yp; k < this._ids.length; k++) {
                const i = this._ids[k];
                const x = coords[2 * i];
                const y = coords[2 * i + 1]; // skip near-duplicate points

                if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue;
                xp = x;
                yp = y; // skip seed triangle points

                if (i === i0 || i === i1 || i === i2) continue; // find a visible edge on the convex hull using edge hash

                let start = 0;

                for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
                    start = hullHash[(key + j) % this._hashSize];
                    if (start !== -1 && start !== hullNext[start]) break;
                }

                start = hullPrev[start];
                let e = start,
                    q;

                while (q = hullNext[e], !orient(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1])) {
                    e = q;

                    if (e === start) {
                        e = -1;
                        break;
                    }
                }

                if (e === -1) continue; // likely a near-duplicate point; skip it
                // add the first triangle from the point

                let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]); // recursively flip triangles from the point until they satisfy the Delaunay condition


                hullTri[i] = this._legalize(t + 2);
                hullTri[e] = t; // keep track of boundary triangles on the hull

                hullSize++; // walk forward through the hull, adding more triangles and flipping recursively

                let n = hullNext[e];

                while (q = hullNext[n], orient(x, y, coords[2 * n], coords[2 * n + 1], coords[2 * q], coords[2 * q + 1])) {
                    t = this._addTriangle(n, i, q, hullTri[i], -1, hullTri[n]);
                    hullTri[i] = this._legalize(t + 2);
                    hullNext[n] = n; // mark as removed

                    hullSize--;
                    n = q;
                } // walk backward from the other side, adding more triangles and flipping


                if (e === start) {
                    while (q = hullPrev[e], orient(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1])) {
                        t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);

                        this._legalize(t + 2);

                        hullTri[q] = t;
                        hullNext[e] = e; // mark as removed

                        hullSize--;
                        e = q;
                    }
                } // update the hull indices


                this._hullStart = hullPrev[i] = e;
                hullNext[e] = hullPrev[n] = i;
                hullNext[i] = n; // save the two new edges in the hash table

                hullHash[this._hashKey(x, y)] = i;
                hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
            }

            this.hull = new Uint32Array(hullSize);

            for (let i = 0, e = this._hullStart; i < hullSize; i++) {
                this.hull[i] = e;
                e = hullNext[e];
            } // trim typed triangle mesh arrays


            this.triangles = this._triangles.subarray(0, this.trianglesLen);
            this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
        }

        _hashKey(x, y) {
            return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
        }

        _legalize(a) {
            const {
                _triangles: triangles,
                _halfedges: halfedges,
                coords
            } = this;
            let i = 0;
            let ar = 0; // recursion eliminated with a fixed-size stack

            while (true) {
                const b = halfedges[a];
                /* if the pair of triangles doesn't satisfy the Delaunay condition
           * (p1 is inside the circumcircle of [p0, pl, pr]), flip them,
           * then do the same check/flip recursively for the new pair of triangles
           *
           *           pl                    pl
           *          /||\                  /  \
           *       al/ || \bl            al/    \a
           *        /  ||  \              /      \
           *       /  a||b  \    flip    /___ar___\
           *     p0\   ||   /p1   =>   p0\---bl---/p1
           *        \  ||  /              \      /
           *       ar\ || /br             b\    /br
           *          \||/                  \  /
           *           pr                    pr
           */

                const a0 = a - a % 3;
                ar = a0 + (a + 2) % 3;

                if (b === -1) {
                    // convex hull edge
                    if (i === 0) break;
                    a = EDGE_STACK[--i];
                    continue;
                }

                const b0 = b - b % 3;
                const al = a0 + (a + 1) % 3;
                const bl = b0 + (b + 2) % 3;
                const p0 = triangles[ar];
                const pr = triangles[a];
                const pl = triangles[al];
                const p1 = triangles[bl];
                const illegal = inCircle(coords[2 * p0], coords[2 * p0 + 1], coords[2 * pr], coords[2 * pr + 1], coords[2 * pl], coords[2 * pl + 1], coords[2 * p1], coords[2 * p1 + 1]);

                if (illegal) {
                    triangles[a] = p1;
                    triangles[b] = p0;
                    const hbl = halfedges[bl]; // edge swapped on the other side of the hull (rare); fix the halfedge reference

                    if (hbl === -1) {
                        let e = this._hullStart;

                        do {
                            if (this._hullTri[e] === bl) {
                                this._hullTri[e] = a;
                                break;
                            }

                            e = this._hullPrev[e];
                        } while (e !== this._hullStart);
                    }

                    this._link(a, hbl);

                    this._link(b, halfedges[ar]);

                    this._link(ar, bl);

                    const br = b0 + (b + 1) % 3; // don't worry about hitting the cap: it can only happen on extremely degenerate input

                    if (i < EDGE_STACK.length) {
                        EDGE_STACK[i++] = br;
                    }
                } else {
                    if (i === 0) break;
                    a = EDGE_STACK[--i];
                }
            }

            return ar;
        }

        _link(a, b) {
            this._halfedges[a] = b;
            if (b !== -1) this._halfedges[b] = a;
        } // add a new triangle given vertex indices and adjacent half-edge ids


        _addTriangle(i0, i1, i2, a, b, c) {
            const t = this.trianglesLen;
            this._triangles[t] = i0;
            this._triangles[t + 1] = i1;
            this._triangles[t + 2] = i2;

            this._link(t, a);

            this._link(t + 1, b);

            this._link(t + 2, c);

            this.trianglesLen += 3;
            return t;
        }

    } // monotonically increases with real angle, but doesn't need expensive trigonometry

    function pseudoAngle(dx, dy) {
        const p = dx / (Math.abs(dx) + Math.abs(dy));
        return (dy > 0 ? 3 - p : 1 + p) / 4; // [0..1]
    }

    function dist(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
    } // return 2d orientation sign if we're confident in it through J. Shewchuk's error bound check


    function orientIfSure(px, py, rx, ry, qx, qy) {
        const l = (ry - py) * (qx - px);
        const r = (rx - px) * (qy - py);
        return Math.abs(l - r) >= 3.3306690738754716e-16 * Math.abs(l + r) ? l - r : 0;
    } // a more robust orientation test that's stable in a given triangle (to fix robustness issues)


    function orient(rx, ry, qx, qy, px, py) {
        const sign = orientIfSure(px, py, rx, ry, qx, qy) || orientIfSure(rx, ry, qx, qy, px, py) || orientIfSure(qx, qy, px, py, rx, ry);
        return sign < 0;
    }

    function inCircle(ax, ay, bx, by, cx, cy, px, py) {
        const dx = ax - px;
        const dy = ay - py;
        const ex = bx - px;
        const ey = by - py;
        const fx = cx - px;
        const fy = cy - py;
        const ap = dx * dx + dy * dy;
        const bp = ex * ex + ey * ey;
        const cp = fx * fx + fy * fy;
        return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
    }

    function circumradius(ax, ay, bx, by, cx, cy) {
        const dx = bx - ax;
        const dy = by - ay;
        const ex = cx - ax;
        const ey = cy - ay;
        const bl = dx * dx + dy * dy;
        const cl = ex * ex + ey * ey;
        const d = 0.5 / (dx * ey - dy * ex);
        const x = (ey * bl - dy * cl) * d;
        const y = (dx * cl - ex * bl) * d;
        return x * x + y * y;
    }

    function circumcenter(ax, ay, bx, by, cx, cy) {
        const dx = bx - ax;
        const dy = by - ay;
        const ex = cx - ax;
        const ey = cy - ay;
        const bl = dx * dx + dy * dy;
        const cl = ex * ex + ey * ey;
        const d = 0.5 / (dx * ey - dy * ex);
        const x = ax + (ey * bl - dy * cl) * d;
        const y = ay + (dx * cl - ex * bl) * d;
        return {
            x,
            y
        };
    }

    function quicksort(ids, dists, left, right) {
        if (right - left <= 20) {
            for (let i = left + 1; i <= right; i++) {
                const temp = ids[i];
                const tempDist = dists[temp];
                let j = i - 1;

                while (j >= left && dists[ids[j]] > tempDist) ids[j + 1] = ids[j--];

                ids[j + 1] = temp;
            }
        } else {
            const median = left + right >> 1;
            let i = left + 1;
            let j = right;
            swap(ids, median, i);
            if (dists[ids[left]] > dists[ids[right]]) swap(ids, left, right);
            if (dists[ids[i]] > dists[ids[right]]) swap(ids, i, right);
            if (dists[ids[left]] > dists[ids[i]]) swap(ids, left, i);
            const temp = ids[i];
            const tempDist = dists[temp];

            while (true) {
                do i++; while (dists[ids[i]] < tempDist);

                do j--; while (dists[ids[j]] > tempDist);

                if (j < i) break;
                swap(ids, i, j);
            }

            ids[left + 1] = ids[j];
            ids[j] = temp;

            if (right - i + 1 >= j - left) {
                quicksort(ids, dists, i, right);
                quicksort(ids, dists, left, j - 1);
            } else {
                quicksort(ids, dists, left, j - 1);
                quicksort(ids, dists, i, right);
            }
        }
    }

    function swap(arr, i, j) {
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    function defaultGetX(p) {
        return p[0];
    }

    function defaultGetY(p) {
        return p[1];
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, module) {
        return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var chroma = createCommonjsModule(function (module, exports) {
        /**
         * chroma.js - JavaScript library for color conversions
         *
         * Copyright (c) 2011-2019, Gregor Aisch
         * All rights reserved.
         *
         * Redistribution and use in source and binary forms, with or without
         * modification, are permitted provided that the following conditions are met:
         *
         * 1. Redistributions of source code must retain the above copyright notice, this
         * list of conditions and the following disclaimer.
         *
         * 2. Redistributions in binary form must reproduce the above copyright notice,
         * this list of conditions and the following disclaimer in the documentation
         * and/or other materials provided with the distribution.
         *
         * 3. The name Gregor Aisch may not be used to endorse or promote products
         * derived from this software without specific prior written permission.
         *
         * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
         * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
         * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
         * DISCLAIMED. IN NO EVENT SHALL GREGOR AISCH OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
         * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
         * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
         * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
         * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
         * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
         * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
         *
         * -------------------------------------------------------
         *
         * chroma.js includes colors from colorbrewer2.org, which are released under
         * the following license:
         *
         * Copyright (c) 2002 Cynthia Brewer, Mark Harrower,
         * and The Pennsylvania State University.
         *
         * Licensed under the Apache License, Version 2.0 (the "License");
         * you may not use this file except in compliance with the License.
         * You may obtain a copy of the License at
         * http://www.apache.org/licenses/LICENSE-2.0
         *
         * Unless required by applicable law or agreed to in writing,
         * software distributed under the License is distributed on an
         * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
         * either express or implied. See the License for the specific
         * language governing permissions and limitations under the License.
         *
         * ------------------------------------------------------
         *
         * Named colors are taken from X11 Color Names.
         * http://www.w3.org/TR/css3-color/#svg-color
         *
         * @preserve
         */
        (function (global, factory) {
            module.exports = factory() ;
        })(commonjsGlobal, function () {

            var limit = function (x, min, max) {
                if (min === void 0) min = 0;
                if (max === void 0) max = 1;
                return x < min ? min : x > max ? max : x;
            };

            var clip_rgb = function (rgb) {
                rgb._clipped = false;
                rgb._unclipped = rgb.slice(0);

                for (var i = 0; i <= 3; i++) {
                    if (i < 3) {
                        if (rgb[i] < 0 || rgb[i] > 255) {
                            rgb._clipped = true;
                        }

                        rgb[i] = limit(rgb[i], 0, 255);
                    } else if (i === 3) {
                        rgb[i] = limit(rgb[i], 0, 1);
                    }
                }

                return rgb;
            }; // ported from jQuery's $.type


            var classToType = {};

            for (var i = 0, list = ['Boolean', 'Number', 'String', 'Function', 'Array', 'Date', 'RegExp', 'Undefined', 'Null']; i < list.length; i += 1) {
                var name = list[i];
                classToType["[object " + name + "]"] = name.toLowerCase();
            }

            var type = function (obj) {
                return classToType[Object.prototype.toString.call(obj)] || "object";
            };

            var unpack = function (args, keyOrder) {
                if (keyOrder === void 0) keyOrder = null; // if called with more than 3 arguments, we return the arguments

                if (args.length >= 3) {
                    return Array.prototype.slice.call(args);
                } // with less than 3 args we check if first arg is object
                // and use the keyOrder string to extract and sort properties


                if (type(args[0]) == 'object' && keyOrder) {
                    return keyOrder.split('').filter(function (k) {
                        return args[0][k] !== undefined;
                    }).map(function (k) {
                        return args[0][k];
                    });
                } // otherwise we just return the first argument
                // (which we suppose is an array of args)


                return args[0];
            };

            var last = function (args) {
                if (args.length < 2) {
                    return null;
                }

                var l = args.length - 1;

                if (type(args[l]) == 'string') {
                    return args[l].toLowerCase();
                }

                return null;
            };

            var PI = Math.PI;
            var utils = {
                clip_rgb: clip_rgb,
                limit: limit,
                type: type,
                unpack: unpack,
                last: last,
                PI: PI,
                TWOPI: PI * 2,
                PITHIRD: PI / 3,
                DEG2RAD: PI / 180,
                RAD2DEG: 180 / PI
            };
            var input = {
                format: {},
                autodetect: []
            };
            var last$1 = utils.last;
            var clip_rgb$1 = utils.clip_rgb;
            var type$1 = utils.type;

            var Color = function Color() {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var me = this;

                if (type$1(args[0]) === 'object' && args[0].constructor && args[0].constructor === this.constructor) {
                    // the argument is already a Color instance
                    return args[0];
                } // last argument could be the mode


                var mode = last$1(args);
                var autodetect = false;

                if (!mode) {
                    autodetect = true;

                    if (!input.sorted) {
                        input.autodetect = input.autodetect.sort(function (a, b) {
                            return b.p - a.p;
                        });
                        input.sorted = true;
                    } // auto-detect format


                    for (var i = 0, list = input.autodetect; i < list.length; i += 1) {
                        var chk = list[i];
                        mode = chk.test.apply(chk, args);

                        if (mode) {
                            break;
                        }
                    }
                }

                if (input.format[mode]) {
                    var rgb = input.format[mode].apply(null, autodetect ? args : args.slice(0, -1));
                    me._rgb = clip_rgb$1(rgb);
                } else {
                    throw new Error('unknown format: ' + args);
                } // add alpha channel


                if (me._rgb.length === 3) {
                    me._rgb.push(1);
                }
            };

            Color.prototype.toString = function toString() {
                if (type$1(this.hex) == 'function') {
                    return this.hex();
                }

                return "[" + this._rgb.join(',') + "]";
            };

            var Color_1 = Color;

            var chroma = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(chroma.Color, [null].concat(args)))();
            };

            chroma.Color = Color_1;
            chroma.version = '2.1.0';
            var chroma_1 = chroma;
            var unpack$1 = utils.unpack;
            var max = Math.max;

            var rgb2cmyk = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$1(args, 'rgb');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                r = r / 255;
                g = g / 255;
                b = b / 255;
                var k = 1 - max(r, max(g, b));
                var f = k < 1 ? 1 / (1 - k) : 0;
                var c = (1 - r - k) * f;
                var m = (1 - g - k) * f;
                var y = (1 - b - k) * f;
                return [c, m, y, k];
            };

            var rgb2cmyk_1 = rgb2cmyk;
            var unpack$2 = utils.unpack;

            var cmyk2rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$2(args, 'cmyk');
                var c = args[0];
                var m = args[1];
                var y = args[2];
                var k = args[3];
                var alpha = args.length > 4 ? args[4] : 1;

                if (k === 1) {
                    return [0, 0, 0, alpha];
                }

                return [c >= 1 ? 0 : 255 * (1 - c) * (1 - k), // r
                    m >= 1 ? 0 : 255 * (1 - m) * (1 - k), // g
                    y >= 1 ? 0 : 255 * (1 - y) * (1 - k), // b
                    alpha];
            };

            var cmyk2rgb_1 = cmyk2rgb;
            var unpack$3 = utils.unpack;
            var type$2 = utils.type;

            Color_1.prototype.cmyk = function () {
                return rgb2cmyk_1(this._rgb);
            };

            chroma_1.cmyk = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['cmyk'])))();
            };

            input.format.cmyk = cmyk2rgb_1;
            input.autodetect.push({
                p: 2,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$3(args, 'cmyk');

                    if (type$2(args) === 'array' && args.length === 4) {
                        return 'cmyk';
                    }
                }
            });
            var unpack$4 = utils.unpack;
            var last$2 = utils.last;

            var rnd = function (a) {
                return Math.round(a * 100) / 100;
            };
            /*
         * supported arguments:
         * - hsl2css(h,s,l)
         * - hsl2css(h,s,l,a)
         * - hsl2css([h,s,l], mode)
         * - hsl2css([h,s,l,a], mode)
         * - hsl2css({h,s,l,a}, mode)
         */


            var hsl2css = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var hsla = unpack$4(args, 'hsla');
                var mode = last$2(args) || 'lsa';
                hsla[0] = rnd(hsla[0] || 0);
                hsla[1] = rnd(hsla[1] * 100) + '%';
                hsla[2] = rnd(hsla[2] * 100) + '%';

                if (mode === 'hsla' || hsla.length > 3 && hsla[3] < 1) {
                    hsla[3] = hsla.length > 3 ? hsla[3] : 1;
                    mode = 'hsla';
                } else {
                    hsla.length = 3;
                }

                return mode + "(" + hsla.join(',') + ")";
            };

            var hsl2css_1 = hsl2css;
            var unpack$5 = utils.unpack;
            /*
         * supported arguments:
         * - rgb2hsl(r,g,b)
         * - rgb2hsl(r,g,b,a)
         * - rgb2hsl([r,g,b])
         * - rgb2hsl([r,g,b,a])
         * - rgb2hsl({r,g,b,a})
         */

            var rgb2hsl = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$5(args, 'rgba');
                var r = args[0];
                var g = args[1];
                var b = args[2];
                r /= 255;
                g /= 255;
                b /= 255;
                var min = Math.min(r, g, b);
                var max = Math.max(r, g, b);
                var l = (max + min) / 2;
                var s, h;

                if (max === min) {
                    s = 0;
                    h = Number.NaN;
                } else {
                    s = l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
                }

                if (r == max) {
                    h = (g - b) / (max - min);
                } else if (g == max) {
                    h = 2 + (b - r) / (max - min);
                } else if (b == max) {
                    h = 4 + (r - g) / (max - min);
                }

                h *= 60;

                if (h < 0) {
                    h += 360;
                }

                if (args.length > 3 && args[3] !== undefined) {
                    return [h, s, l, args[3]];
                }

                return [h, s, l];
            };

            var rgb2hsl_1 = rgb2hsl;
            var unpack$6 = utils.unpack;
            var last$3 = utils.last;
            var round = Math.round;
            /*
         * supported arguments:
         * - rgb2css(r,g,b)
         * - rgb2css(r,g,b,a)
         * - rgb2css([r,g,b], mode)
         * - rgb2css([r,g,b,a], mode)
         * - rgb2css({r,g,b,a}, mode)
         */

            var rgb2css = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var rgba = unpack$6(args, 'rgba');
                var mode = last$3(args) || 'rgb';

                if (mode.substr(0, 3) == 'hsl') {
                    return hsl2css_1(rgb2hsl_1(rgba), mode);
                }

                rgba[0] = round(rgba[0]);
                rgba[1] = round(rgba[1]);
                rgba[2] = round(rgba[2]);

                if (mode === 'rgba' || rgba.length > 3 && rgba[3] < 1) {
                    rgba[3] = rgba.length > 3 ? rgba[3] : 1;
                    mode = 'rgba';
                }

                return mode + "(" + rgba.slice(0, mode === 'rgb' ? 3 : 4).join(',') + ")";
            };

            var rgb2css_1 = rgb2css;
            var unpack$7 = utils.unpack;
            var round$1 = Math.round;

            var hsl2rgb = function () {
                var assign;
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$7(args, 'hsl');
                var h = args[0];
                var s = args[1];
                var l = args[2];
                var r, g, b;

                if (s === 0) {
                    r = g = b = l * 255;
                } else {
                    var t3 = [0, 0, 0];
                    var c = [0, 0, 0];
                    var t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    var t1 = 2 * l - t2;
                    var h_ = h / 360;
                    t3[0] = h_ + 1 / 3;
                    t3[1] = h_;
                    t3[2] = h_ - 1 / 3;

                    for (var i = 0; i < 3; i++) {
                        if (t3[i] < 0) {
                            t3[i] += 1;
                        }

                        if (t3[i] > 1) {
                            t3[i] -= 1;
                        }

                        if (6 * t3[i] < 1) {
                            c[i] = t1 + (t2 - t1) * 6 * t3[i];
                        } else if (2 * t3[i] < 1) {
                            c[i] = t2;
                        } else if (3 * t3[i] < 2) {
                            c[i] = t1 + (t2 - t1) * (2 / 3 - t3[i]) * 6;
                        } else {
                            c[i] = t1;
                        }
                    }

                    assign = [round$1(c[0] * 255), round$1(c[1] * 255), round$1(c[2] * 255)], r = assign[0], g = assign[1], b = assign[2];
                }

                if (args.length > 3) {
                    // keep alpha channel
                    return [r, g, b, args[3]];
                }

                return [r, g, b, 1];
            };

            var hsl2rgb_1 = hsl2rgb;
            var RE_RGB = /^rgb\(\s*(-?\d+),\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/;
            var RE_RGBA = /^rgba\(\s*(-?\d+),\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*([01]|[01]?\.\d+)\)$/;
            var RE_RGB_PCT = /^rgb\(\s*(-?\d+(?:\.\d+)?)%,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/;
            var RE_RGBA_PCT = /^rgba\(\s*(-?\d+(?:\.\d+)?)%,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)$/;
            var RE_HSL = /^hsl\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/;
            var RE_HSLA = /^hsla\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)$/;
            var round$2 = Math.round;

            var css2rgb = function (css) {
                css = css.toLowerCase().trim();
                var m;

                if (input.format.named) {
                    try {
                        return input.format.named(css);
                    } catch (e) {// eslint-disable-next-line
                    }
                } // rgb(250,20,0)


                if (m = css.match(RE_RGB)) {
                    var rgb = m.slice(1, 4);

                    for (var i = 0; i < 3; i++) {
                        rgb[i] = +rgb[i];
                    }

                    rgb[3] = 1; // default alpha

                    return rgb;
                } // rgba(250,20,0,0.4)


                if (m = css.match(RE_RGBA)) {
                    var rgb$1 = m.slice(1, 5);

                    for (var i$1 = 0; i$1 < 4; i$1++) {
                        rgb$1[i$1] = +rgb$1[i$1];
                    }

                    return rgb$1;
                } // rgb(100%,0%,0%)


                if (m = css.match(RE_RGB_PCT)) {
                    var rgb$2 = m.slice(1, 4);

                    for (var i$2 = 0; i$2 < 3; i$2++) {
                        rgb$2[i$2] = round$2(rgb$2[i$2] * 2.55);
                    }

                    rgb$2[3] = 1; // default alpha

                    return rgb$2;
                } // rgba(100%,0%,0%,0.4)


                if (m = css.match(RE_RGBA_PCT)) {
                    var rgb$3 = m.slice(1, 5);

                    for (var i$3 = 0; i$3 < 3; i$3++) {
                        rgb$3[i$3] = round$2(rgb$3[i$3] * 2.55);
                    }

                    rgb$3[3] = +rgb$3[3];
                    return rgb$3;
                } // hsl(0,100%,50%)


                if (m = css.match(RE_HSL)) {
                    var hsl = m.slice(1, 4);
                    hsl[1] *= 0.01;
                    hsl[2] *= 0.01;
                    var rgb$4 = hsl2rgb_1(hsl);
                    rgb$4[3] = 1;
                    return rgb$4;
                } // hsla(0,100%,50%,0.5)


                if (m = css.match(RE_HSLA)) {
                    var hsl$1 = m.slice(1, 4);
                    hsl$1[1] *= 0.01;
                    hsl$1[2] *= 0.01;
                    var rgb$5 = hsl2rgb_1(hsl$1);
                    rgb$5[3] = +m[4]; // default alpha = 1

                    return rgb$5;
                }
            };

            css2rgb.test = function (s) {
                return RE_RGB.test(s) || RE_RGBA.test(s) || RE_RGB_PCT.test(s) || RE_RGBA_PCT.test(s) || RE_HSL.test(s) || RE_HSLA.test(s);
            };

            var css2rgb_1 = css2rgb;
            var type$3 = utils.type;

            Color_1.prototype.css = function (mode) {
                return rgb2css_1(this._rgb, mode);
            };

            chroma_1.css = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['css'])))();
            };

            input.format.css = css2rgb_1;
            input.autodetect.push({
                p: 5,
                test: function (h) {
                    var rest = [],
                        len = arguments.length - 1;

                    while (len-- > 0) rest[len] = arguments[len + 1];

                    if (!rest.length && type$3(h) === 'string' && css2rgb_1.test(h)) {
                        return 'css';
                    }
                }
            });
            var unpack$8 = utils.unpack;

            input.format.gl = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var rgb = unpack$8(args, 'rgba');
                rgb[0] *= 255;
                rgb[1] *= 255;
                rgb[2] *= 255;
                return rgb;
            };

            chroma_1.gl = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['gl'])))();
            };

            Color_1.prototype.gl = function () {
                var rgb = this._rgb;
                return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, rgb[3]];
            };

            var unpack$9 = utils.unpack;

            var rgb2hcg = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$9(args, 'rgb');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                var min = Math.min(r, g, b);
                var max = Math.max(r, g, b);
                var delta = max - min;
                var c = delta * 100 / 255;

                var _g = min / (255 - delta) * 100;

                var h;

                if (delta === 0) {
                    h = Number.NaN;
                } else {
                    if (r === max) {
                        h = (g - b) / delta;
                    }

                    if (g === max) {
                        h = 2 + (b - r) / delta;
                    }

                    if (b === max) {
                        h = 4 + (r - g) / delta;
                    }

                    h *= 60;

                    if (h < 0) {
                        h += 360;
                    }
                }

                return [h, c, _g];
            };

            var rgb2hcg_1 = rgb2hcg;
            var unpack$a = utils.unpack;
            var floor = Math.floor;
            /*
         * this is basically just HSV with some minor tweaks
         *
         * hue.. [0..360]
         * chroma .. [0..1]
         * grayness .. [0..1]
         */

            var hcg2rgb = function () {
                var assign, assign$1, assign$2, assign$3, assign$4, assign$5;
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$a(args, 'hcg');
                var h = args[0];
                var c = args[1];
                var _g = args[2];
                var r, g, b;
                _g = _g * 255;

                var _c = c * 255;

                if (c === 0) {
                    r = g = b = _g;
                } else {
                    if (h === 360) {
                        h = 0;
                    }

                    if (h > 360) {
                        h -= 360;
                    }

                    if (h < 0) {
                        h += 360;
                    }

                    h /= 60;
                    var i = floor(h);
                    var f = h - i;
                    var p = _g * (1 - c);
                    var q = p + _c * (1 - f);
                    var t = p + _c * f;
                    var v = p + _c;

                    switch (i) {
                        case 0:
                            assign = [v, t, p], r = assign[0], g = assign[1], b = assign[2];
                            break;

                        case 1:
                            assign$1 = [q, v, p], r = assign$1[0], g = assign$1[1], b = assign$1[2];
                            break;

                        case 2:
                            assign$2 = [p, v, t], r = assign$2[0], g = assign$2[1], b = assign$2[2];
                            break;

                        case 3:
                            assign$3 = [p, q, v], r = assign$3[0], g = assign$3[1], b = assign$3[2];
                            break;

                        case 4:
                            assign$4 = [t, p, v], r = assign$4[0], g = assign$4[1], b = assign$4[2];
                            break;

                        case 5:
                            assign$5 = [v, p, q], r = assign$5[0], g = assign$5[1], b = assign$5[2];
                            break;
                    }
                }

                return [r, g, b, args.length > 3 ? args[3] : 1];
            };

            var hcg2rgb_1 = hcg2rgb;
            var unpack$b = utils.unpack;
            var type$4 = utils.type;

            Color_1.prototype.hcg = function () {
                return rgb2hcg_1(this._rgb);
            };

            chroma_1.hcg = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['hcg'])))();
            };

            input.format.hcg = hcg2rgb_1;
            input.autodetect.push({
                p: 1,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$b(args, 'hcg');

                    if (type$4(args) === 'array' && args.length === 3) {
                        return 'hcg';
                    }
                }
            });
            var unpack$c = utils.unpack;
            var last$4 = utils.last;
            var round$3 = Math.round;

            var rgb2hex = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$c(args, 'rgba');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                var a = ref[3];
                var mode = last$4(args) || 'auto';

                if (a === undefined) {
                    a = 1;
                }

                if (mode === 'auto') {
                    mode = a < 1 ? 'rgba' : 'rgb';
                }

                r = round$3(r);
                g = round$3(g);
                b = round$3(b);
                var u = r << 16 | g << 8 | b;
                var str = "000000" + u.toString(16); //#.toUpperCase();

                str = str.substr(str.length - 6);
                var hxa = '0' + round$3(a * 255).toString(16);
                hxa = hxa.substr(hxa.length - 2);

                switch (mode.toLowerCase()) {
                    case 'rgba':
                        return "#" + str + hxa;

                    case 'argb':
                        return "#" + hxa + str;

                    default:
                        return "#" + str;
                }
            };

            var rgb2hex_1 = rgb2hex;
            var RE_HEX = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            var RE_HEXA = /^#?([A-Fa-f0-9]{8}|[A-Fa-f0-9]{4})$/;

            var hex2rgb = function (hex) {
                if (hex.match(RE_HEX)) {
                    // remove optional leading #
                    if (hex.length === 4 || hex.length === 7) {
                        hex = hex.substr(1);
                    } // expand short-notation to full six-digit


                    if (hex.length === 3) {
                        hex = hex.split('');
                        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
                    }

                    var u = parseInt(hex, 16);
                    var r = u >> 16;
                    var g = u >> 8 & 0xFF;
                    var b = u & 0xFF;
                    return [r, g, b, 1];
                } // match rgba hex format, eg #FF000077


                if (hex.match(RE_HEXA)) {
                    if (hex.length === 5 || hex.length === 9) {
                        // remove optional leading #
                        hex = hex.substr(1);
                    } // expand short-notation to full eight-digit


                    if (hex.length === 4) {
                        hex = hex.split('');
                        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
                    }

                    var u$1 = parseInt(hex, 16);
                    var r$1 = u$1 >> 24 & 0xFF;
                    var g$1 = u$1 >> 16 & 0xFF;
                    var b$1 = u$1 >> 8 & 0xFF;
                    var a = Math.round((u$1 & 0xFF) / 0xFF * 100) / 100;
                    return [r$1, g$1, b$1, a];
                } // we used to check for css colors here
                // if _input.css? and rgb = _input.css hex
                //     return rgb


                throw new Error("unknown hex color: " + hex);
            };

            var hex2rgb_1 = hex2rgb;
            var type$5 = utils.type;

            Color_1.prototype.hex = function (mode) {
                return rgb2hex_1(this._rgb, mode);
            };

            chroma_1.hex = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['hex'])))();
            };

            input.format.hex = hex2rgb_1;
            input.autodetect.push({
                p: 4,
                test: function (h) {
                    var rest = [],
                        len = arguments.length - 1;

                    while (len-- > 0) rest[len] = arguments[len + 1];

                    if (!rest.length && type$5(h) === 'string' && [3, 4, 5, 6, 7, 8, 9].indexOf(h.length) >= 0) {
                        return 'hex';
                    }
                }
            });
            var unpack$d = utils.unpack;
            var TWOPI = utils.TWOPI;
            var min = Math.min;
            var sqrt = Math.sqrt;
            var acos = Math.acos;

            var rgb2hsi = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];
                /*
          borrowed from here:
          http://hummer.stanford.edu/museinfo/doc/examples/humdrum/keyscape2/rgb2hsi.cpp
          */


                var ref = unpack$d(args, 'rgb');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                r /= 255;
                g /= 255;
                b /= 255;
                var h;
                var min_ = min(r, g, b);
                var i = (r + g + b) / 3;
                var s = i > 0 ? 1 - min_ / i : 0;

                if (s === 0) {
                    h = NaN;
                } else {
                    h = (r - g + (r - b)) / 2;
                    h /= sqrt((r - g) * (r - g) + (r - b) * (g - b));
                    h = acos(h);

                    if (b > g) {
                        h = TWOPI - h;
                    }

                    h /= TWOPI;
                }

                return [h * 360, s, i];
            };

            var rgb2hsi_1 = rgb2hsi;
            var unpack$e = utils.unpack;
            var limit$1 = utils.limit;
            var TWOPI$1 = utils.TWOPI;
            var PITHIRD = utils.PITHIRD;
            var cos = Math.cos;
            /*
         * hue [0..360]
         * saturation [0..1]
         * intensity [0..1]
         */

            var hsi2rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];
                /*
          borrowed from here:
          http://hummer.stanford.edu/museinfo/doc/examples/humdrum/keyscape2/hsi2rgb.cpp
          */


                args = unpack$e(args, 'hsi');
                var h = args[0];
                var s = args[1];
                var i = args[2];
                var r, g, b;

                if (isNaN(h)) {
                    h = 0;
                }

                if (isNaN(s)) {
                    s = 0;
                } // normalize hue


                if (h > 360) {
                    h -= 360;
                }

                if (h < 0) {
                    h += 360;
                }

                h /= 360;

                if (h < 1 / 3) {
                    b = (1 - s) / 3;
                    r = (1 + s * cos(TWOPI$1 * h) / cos(PITHIRD - TWOPI$1 * h)) / 3;
                    g = 1 - (b + r);
                } else if (h < 2 / 3) {
                    h -= 1 / 3;
                    r = (1 - s) / 3;
                    g = (1 + s * cos(TWOPI$1 * h) / cos(PITHIRD - TWOPI$1 * h)) / 3;
                    b = 1 - (r + g);
                } else {
                    h -= 2 / 3;
                    g = (1 - s) / 3;
                    b = (1 + s * cos(TWOPI$1 * h) / cos(PITHIRD - TWOPI$1 * h)) / 3;
                    r = 1 - (g + b);
                }

                r = limit$1(i * r * 3);
                g = limit$1(i * g * 3);
                b = limit$1(i * b * 3);
                return [r * 255, g * 255, b * 255, args.length > 3 ? args[3] : 1];
            };

            var hsi2rgb_1 = hsi2rgb;
            var unpack$f = utils.unpack;
            var type$6 = utils.type;

            Color_1.prototype.hsi = function () {
                return rgb2hsi_1(this._rgb);
            };

            chroma_1.hsi = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['hsi'])))();
            };

            input.format.hsi = hsi2rgb_1;
            input.autodetect.push({
                p: 2,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$f(args, 'hsi');

                    if (type$6(args) === 'array' && args.length === 3) {
                        return 'hsi';
                    }
                }
            });
            var unpack$g = utils.unpack;
            var type$7 = utils.type;

            Color_1.prototype.hsl = function () {
                return rgb2hsl_1(this._rgb);
            };

            chroma_1.hsl = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['hsl'])))();
            };

            input.format.hsl = hsl2rgb_1;
            input.autodetect.push({
                p: 2,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$g(args, 'hsl');

                    if (type$7(args) === 'array' && args.length === 3) {
                        return 'hsl';
                    }
                }
            });
            var unpack$h = utils.unpack;
            var min$1 = Math.min;
            var max$1 = Math.max;
            /*
         * supported arguments:
         * - rgb2hsv(r,g,b)
         * - rgb2hsv([r,g,b])
         * - rgb2hsv({r,g,b})
         */

            var rgb2hsl$1 = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$h(args, 'rgb');
                var r = args[0];
                var g = args[1];
                var b = args[2];
                var min_ = min$1(r, g, b);
                var max_ = max$1(r, g, b);
                var delta = max_ - min_;
                var h, s, v;
                v = max_ / 255.0;

                if (max_ === 0) {
                    h = Number.NaN;
                    s = 0;
                } else {
                    s = delta / max_;

                    if (r === max_) {
                        h = (g - b) / delta;
                    }

                    if (g === max_) {
                        h = 2 + (b - r) / delta;
                    }

                    if (b === max_) {
                        h = 4 + (r - g) / delta;
                    }

                    h *= 60;

                    if (h < 0) {
                        h += 360;
                    }
                }

                return [h, s, v];
            };

            var rgb2hsv = rgb2hsl$1;
            var unpack$i = utils.unpack;
            var floor$1 = Math.floor;

            var hsv2rgb = function () {
                var assign, assign$1, assign$2, assign$3, assign$4, assign$5;
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$i(args, 'hsv');
                var h = args[0];
                var s = args[1];
                var v = args[2];
                var r, g, b;
                v *= 255;

                if (s === 0) {
                    r = g = b = v;
                } else {
                    if (h === 360) {
                        h = 0;
                    }

                    if (h > 360) {
                        h -= 360;
                    }

                    if (h < 0) {
                        h += 360;
                    }

                    h /= 60;
                    var i = floor$1(h);
                    var f = h - i;
                    var p = v * (1 - s);
                    var q = v * (1 - s * f);
                    var t = v * (1 - s * (1 - f));

                    switch (i) {
                        case 0:
                            assign = [v, t, p], r = assign[0], g = assign[1], b = assign[2];
                            break;

                        case 1:
                            assign$1 = [q, v, p], r = assign$1[0], g = assign$1[1], b = assign$1[2];
                            break;

                        case 2:
                            assign$2 = [p, v, t], r = assign$2[0], g = assign$2[1], b = assign$2[2];
                            break;

                        case 3:
                            assign$3 = [p, q, v], r = assign$3[0], g = assign$3[1], b = assign$3[2];
                            break;

                        case 4:
                            assign$4 = [t, p, v], r = assign$4[0], g = assign$4[1], b = assign$4[2];
                            break;

                        case 5:
                            assign$5 = [v, p, q], r = assign$5[0], g = assign$5[1], b = assign$5[2];
                            break;
                    }
                }

                return [r, g, b, args.length > 3 ? args[3] : 1];
            };

            var hsv2rgb_1 = hsv2rgb;
            var unpack$j = utils.unpack;
            var type$8 = utils.type;

            Color_1.prototype.hsv = function () {
                return rgb2hsv(this._rgb);
            };

            chroma_1.hsv = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['hsv'])))();
            };

            input.format.hsv = hsv2rgb_1;
            input.autodetect.push({
                p: 2,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$j(args, 'hsv');

                    if (type$8(args) === 'array' && args.length === 3) {
                        return 'hsv';
                    }
                }
            });
            var labConstants = {
                // Corresponds roughly to RGB brighter/darker
                Kn: 18,
                // D65 standard referent
                Xn: 0.950470,
                Yn: 1,
                Zn: 1.088830,
                t0: 0.137931034,
                // 4 / 29
                t1: 0.206896552,
                // 6 / 29
                t2: 0.12841855,
                // 3 * t1 * t1
                t3: 0.008856452 // t1 * t1 * t1

            };
            var unpack$k = utils.unpack;
            var pow = Math.pow;

            var rgb2lab = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$k(args, 'rgb');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                var ref$1 = rgb2xyz(r, g, b);
                var x = ref$1[0];
                var y = ref$1[1];
                var z = ref$1[2];
                var l = 116 * y - 16;
                return [l < 0 ? 0 : l, 500 * (x - y), 200 * (y - z)];
            };

            var rgb_xyz = function (r) {
                if ((r /= 255) <= 0.04045) {
                    return r / 12.92;
                }

                return pow((r + 0.055) / 1.055, 2.4);
            };

            var xyz_lab = function (t) {
                if (t > labConstants.t3) {
                    return pow(t, 1 / 3);
                }

                return t / labConstants.t2 + labConstants.t0;
            };

            var rgb2xyz = function (r, g, b) {
                r = rgb_xyz(r);
                g = rgb_xyz(g);
                b = rgb_xyz(b);
                var x = xyz_lab((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / labConstants.Xn);
                var y = xyz_lab((0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / labConstants.Yn);
                var z = xyz_lab((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / labConstants.Zn);
                return [x, y, z];
            };

            var rgb2lab_1 = rgb2lab;
            var unpack$l = utils.unpack;
            var pow$1 = Math.pow;
            /*
         * L* [0..100]
         * a [-100..100]
         * b [-100..100]
         */

            var lab2rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$l(args, 'lab');
                var l = args[0];
                var a = args[1];
                var b = args[2];
                var x, y, z, r, g, b_;
                y = (l + 16) / 116;
                x = isNaN(a) ? y : y + a / 500;
                z = isNaN(b) ? y : y - b / 200;
                y = labConstants.Yn * lab_xyz(y);
                x = labConstants.Xn * lab_xyz(x);
                z = labConstants.Zn * lab_xyz(z);
                r = xyz_rgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z); // D65 -> sRGB

                g = xyz_rgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z);
                b_ = xyz_rgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z);
                return [r, g, b_, args.length > 3 ? args[3] : 1];
            };

            var xyz_rgb = function (r) {
                return 255 * (r <= 0.00304 ? 12.92 * r : 1.055 * pow$1(r, 1 / 2.4) - 0.055);
            };

            var lab_xyz = function (t) {
                return t > labConstants.t1 ? t * t * t : labConstants.t2 * (t - labConstants.t0);
            };

            var lab2rgb_1 = lab2rgb;
            var unpack$m = utils.unpack;
            var type$9 = utils.type;

            Color_1.prototype.lab = function () {
                return rgb2lab_1(this._rgb);
            };

            chroma_1.lab = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['lab'])))();
            };

            input.format.lab = lab2rgb_1;
            input.autodetect.push({
                p: 2,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$m(args, 'lab');

                    if (type$9(args) === 'array' && args.length === 3) {
                        return 'lab';
                    }
                }
            });
            var unpack$n = utils.unpack;
            var RAD2DEG = utils.RAD2DEG;
            var sqrt$1 = Math.sqrt;
            var atan2 = Math.atan2;
            var round$4 = Math.round;

            var lab2lch = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$n(args, 'lab');
                var l = ref[0];
                var a = ref[1];
                var b = ref[2];
                var c = sqrt$1(a * a + b * b);
                var h = (atan2(b, a) * RAD2DEG + 360) % 360;

                if (round$4(c * 10000) === 0) {
                    h = Number.NaN;
                }

                return [l, c, h];
            };

            var lab2lch_1 = lab2lch;
            var unpack$o = utils.unpack;

            var rgb2lch = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$o(args, 'rgb');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                var ref$1 = rgb2lab_1(r, g, b);
                var l = ref$1[0];
                var a = ref$1[1];
                var b_ = ref$1[2];
                return lab2lch_1(l, a, b_);
            };

            var rgb2lch_1 = rgb2lch;
            var unpack$p = utils.unpack;
            var DEG2RAD = utils.DEG2RAD;
            var sin = Math.sin;
            var cos$1 = Math.cos;

            var lch2lab = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];
                /*
          Convert from a qualitative parameter h and a quantitative parameter l to a 24-bit pixel.
          These formulas were invented by David Dalrymple to obtain maximum contrast without going
          out of gamut if the parameters are in the range 0-1.
           A saturation multiplier was added by Gregor Aisch
          */


                var ref = unpack$p(args, 'lch');
                var l = ref[0];
                var c = ref[1];
                var h = ref[2];

                if (isNaN(h)) {
                    h = 0;
                }

                h = h * DEG2RAD;
                return [l, cos$1(h) * c, sin(h) * c];
            };

            var lch2lab_1 = lch2lab;
            var unpack$q = utils.unpack;

            var lch2rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                args = unpack$q(args, 'lch');
                var l = args[0];
                var c = args[1];
                var h = args[2];
                var ref = lch2lab_1(l, c, h);
                var L = ref[0];
                var a = ref[1];
                var b_ = ref[2];
                var ref$1 = lab2rgb_1(L, a, b_);
                var r = ref$1[0];
                var g = ref$1[1];
                var b = ref$1[2];
                return [r, g, b, args.length > 3 ? args[3] : 1];
            };

            var lch2rgb_1 = lch2rgb;
            var unpack$r = utils.unpack;

            var hcl2rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var hcl = unpack$r(args, 'hcl').reverse();
                return lch2rgb_1.apply(void 0, hcl);
            };

            var hcl2rgb_1 = hcl2rgb;
            var unpack$s = utils.unpack;
            var type$a = utils.type;

            Color_1.prototype.lch = function () {
                return rgb2lch_1(this._rgb);
            };

            Color_1.prototype.hcl = function () {
                return rgb2lch_1(this._rgb).reverse();
            };

            chroma_1.lch = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['lch'])))();
            };

            chroma_1.hcl = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['hcl'])))();
            };

            input.format.lch = lch2rgb_1;
            input.format.hcl = hcl2rgb_1;
            ['lch', 'hcl'].forEach(function (m) {
                return input.autodetect.push({
                    p: 2,
                    test: function () {
                        var args = [],
                            len = arguments.length;

                        while (len--) args[len] = arguments[len];

                        args = unpack$s(args, m);

                        if (type$a(args) === 'array' && args.length === 3) {
                            return m;
                        }
                    }
                });
            });
            /**
             X11 color names
             http://www.w3.org/TR/css3-color/#svg-color
             */

            var w3cx11 = {
                aliceblue: '#f0f8ff',
                antiquewhite: '#faebd7',
                aqua: '#00ffff',
                aquamarine: '#7fffd4',
                azure: '#f0ffff',
                beige: '#f5f5dc',
                bisque: '#ffe4c4',
                black: '#000000',
                blanchedalmond: '#ffebcd',
                blue: '#0000ff',
                blueviolet: '#8a2be2',
                brown: '#a52a2a',
                burlywood: '#deb887',
                cadetblue: '#5f9ea0',
                chartreuse: '#7fff00',
                chocolate: '#d2691e',
                coral: '#ff7f50',
                cornflower: '#6495ed',
                cornflowerblue: '#6495ed',
                cornsilk: '#fff8dc',
                crimson: '#dc143c',
                cyan: '#00ffff',
                darkblue: '#00008b',
                darkcyan: '#008b8b',
                darkgoldenrod: '#b8860b',
                darkgray: '#a9a9a9',
                darkgreen: '#006400',
                darkgrey: '#a9a9a9',
                darkkhaki: '#bdb76b',
                darkmagenta: '#8b008b',
                darkolivegreen: '#556b2f',
                darkorange: '#ff8c00',
                darkorchid: '#9932cc',
                darkred: '#8b0000',
                darksalmon: '#e9967a',
                darkseagreen: '#8fbc8f',
                darkslateblue: '#483d8b',
                darkslategray: '#2f4f4f',
                darkslategrey: '#2f4f4f',
                darkturquoise: '#00ced1',
                darkviolet: '#9400d3',
                deeppink: '#ff1493',
                deepskyblue: '#00bfff',
                dimgray: '#696969',
                dimgrey: '#696969',
                dodgerblue: '#1e90ff',
                firebrick: '#b22222',
                floralwhite: '#fffaf0',
                forestgreen: '#228b22',
                fuchsia: '#ff00ff',
                gainsboro: '#dcdcdc',
                ghostwhite: '#f8f8ff',
                gold: '#ffd700',
                goldenrod: '#daa520',
                gray: '#808080',
                green: '#008000',
                greenyellow: '#adff2f',
                grey: '#808080',
                honeydew: '#f0fff0',
                hotpink: '#ff69b4',
                indianred: '#cd5c5c',
                indigo: '#4b0082',
                ivory: '#fffff0',
                khaki: '#f0e68c',
                laserlemon: '#ffff54',
                lavender: '#e6e6fa',
                lavenderblush: '#fff0f5',
                lawngreen: '#7cfc00',
                lemonchiffon: '#fffacd',
                lightblue: '#add8e6',
                lightcoral: '#f08080',
                lightcyan: '#e0ffff',
                lightgoldenrod: '#fafad2',
                lightgoldenrodyellow: '#fafad2',
                lightgray: '#d3d3d3',
                lightgreen: '#90ee90',
                lightgrey: '#d3d3d3',
                lightpink: '#ffb6c1',
                lightsalmon: '#ffa07a',
                lightseagreen: '#20b2aa',
                lightskyblue: '#87cefa',
                lightslategray: '#778899',
                lightslategrey: '#778899',
                lightsteelblue: '#b0c4de',
                lightyellow: '#ffffe0',
                lime: '#00ff00',
                limegreen: '#32cd32',
                linen: '#faf0e6',
                magenta: '#ff00ff',
                maroon: '#800000',
                maroon2: '#7f0000',
                maroon3: '#b03060',
                mediumaquamarine: '#66cdaa',
                mediumblue: '#0000cd',
                mediumorchid: '#ba55d3',
                mediumpurple: '#9370db',
                mediumseagreen: '#3cb371',
                mediumslateblue: '#7b68ee',
                mediumspringgreen: '#00fa9a',
                mediumturquoise: '#48d1cc',
                mediumvioletred: '#c71585',
                midnightblue: '#191970',
                mintcream: '#f5fffa',
                mistyrose: '#ffe4e1',
                moccasin: '#ffe4b5',
                navajowhite: '#ffdead',
                navy: '#000080',
                oldlace: '#fdf5e6',
                olive: '#808000',
                olivedrab: '#6b8e23',
                orange: '#ffa500',
                orangered: '#ff4500',
                orchid: '#da70d6',
                palegoldenrod: '#eee8aa',
                palegreen: '#98fb98',
                paleturquoise: '#afeeee',
                palevioletred: '#db7093',
                papayawhip: '#ffefd5',
                peachpuff: '#ffdab9',
                peru: '#cd853f',
                pink: '#ffc0cb',
                plum: '#dda0dd',
                powderblue: '#b0e0e6',
                purple: '#800080',
                purple2: '#7f007f',
                purple3: '#a020f0',
                rebeccapurple: '#663399',
                red: '#ff0000',
                rosybrown: '#bc8f8f',
                royalblue: '#4169e1',
                saddlebrown: '#8b4513',
                salmon: '#fa8072',
                sandybrown: '#f4a460',
                seagreen: '#2e8b57',
                seashell: '#fff5ee',
                sienna: '#a0522d',
                silver: '#c0c0c0',
                skyblue: '#87ceeb',
                slateblue: '#6a5acd',
                slategray: '#708090',
                slategrey: '#708090',
                snow: '#fffafa',
                springgreen: '#00ff7f',
                steelblue: '#4682b4',
                tan: '#d2b48c',
                teal: '#008080',
                thistle: '#d8bfd8',
                tomato: '#ff6347',
                turquoise: '#40e0d0',
                violet: '#ee82ee',
                wheat: '#f5deb3',
                white: '#ffffff',
                whitesmoke: '#f5f5f5',
                yellow: '#ffff00',
                yellowgreen: '#9acd32'
            };
            var w3cx11_1 = w3cx11;
            var type$b = utils.type;

            Color_1.prototype.name = function () {
                var hex = rgb2hex_1(this._rgb, 'rgb');

                for (var i = 0, list = Object.keys(w3cx11_1); i < list.length; i += 1) {
                    var n = list[i];

                    if (w3cx11_1[n] === hex) {
                        return n.toLowerCase();
                    }
                }

                return hex;
            };

            input.format.named = function (name) {
                name = name.toLowerCase();

                if (w3cx11_1[name]) {
                    return hex2rgb_1(w3cx11_1[name]);
                }

                throw new Error('unknown color name: ' + name);
            };

            input.autodetect.push({
                p: 5,
                test: function (h) {
                    var rest = [],
                        len = arguments.length - 1;

                    while (len-- > 0) rest[len] = arguments[len + 1];

                    if (!rest.length && type$b(h) === 'string' && w3cx11_1[h.toLowerCase()]) {
                        return 'named';
                    }
                }
            });
            var unpack$t = utils.unpack;

            var rgb2num = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var ref = unpack$t(args, 'rgb');
                var r = ref[0];
                var g = ref[1];
                var b = ref[2];
                return (r << 16) + (g << 8) + b;
            };

            var rgb2num_1 = rgb2num;
            var type$c = utils.type;

            var num2rgb = function (num) {
                if (type$c(num) == "number" && num >= 0 && num <= 0xFFFFFF) {
                    var r = num >> 16;
                    var g = num >> 8 & 0xFF;
                    var b = num & 0xFF;
                    return [r, g, b, 1];
                }

                throw new Error("unknown num color: " + num);
            };

            var num2rgb_1 = num2rgb;
            var type$d = utils.type;

            Color_1.prototype.num = function () {
                return rgb2num_1(this._rgb);
            };

            chroma_1.num = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['num'])))();
            };

            input.format.num = num2rgb_1;
            input.autodetect.push({
                p: 5,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    if (args.length === 1 && type$d(args[0]) === 'number' && args[0] >= 0 && args[0] <= 0xFFFFFF) {
                        return 'num';
                    }
                }
            });
            var unpack$u = utils.unpack;
            var type$e = utils.type;
            var round$5 = Math.round;

            Color_1.prototype.rgb = function (rnd) {
                if (rnd === void 0) rnd = true;

                if (rnd === false) {
                    return this._rgb.slice(0, 3);
                }

                return this._rgb.slice(0, 3).map(round$5);
            };

            Color_1.prototype.rgba = function (rnd) {
                if (rnd === void 0) rnd = true;
                return this._rgb.slice(0, 4).map(function (v, i) {
                    return i < 3 ? rnd === false ? v : round$5(v) : v;
                });
            };

            chroma_1.rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['rgb'])))();
            };

            input.format.rgb = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var rgba = unpack$u(args, 'rgba');

                if (rgba[3] === undefined) {
                    rgba[3] = 1;
                }

                return rgba;
            };

            input.autodetect.push({
                p: 3,
                test: function () {
                    var args = [],
                        len = arguments.length;

                    while (len--) args[len] = arguments[len];

                    args = unpack$u(args, 'rgba');

                    if (type$e(args) === 'array' && (args.length === 3 || args.length === 4 && type$e(args[3]) == 'number' && args[3] >= 0 && args[3] <= 1)) {
                        return 'rgb';
                    }
                }
            });
            /*
         * Based on implementation by Neil Bartlett
         * https://github.com/neilbartlett/color-temperature
         */

            var log = Math.log;

            var temperature2rgb = function (kelvin) {
                var temp = kelvin / 100;
                var r, g, b;

                if (temp < 66) {
                    r = 255;
                    g = -155.25485562709179 - 0.44596950469579133 * (g = temp - 2) + 104.49216199393888 * log(g);
                    b = temp < 20 ? 0 : -254.76935184120902 + 0.8274096064007395 * (b = temp - 10) + 115.67994401066147 * log(b);
                } else {
                    r = 351.97690566805693 + 0.114206453784165 * (r = temp - 55) - 40.25366309332127 * log(r);
                    g = 325.4494125711974 + 0.07943456536662342 * (g = temp - 50) - 28.0852963507957 * log(g);
                    b = 255;
                }

                return [r, g, b, 1];
            };

            var temperature2rgb_1 = temperature2rgb;
            /*
         * Based on implementation by Neil Bartlett
         * https://github.com/neilbartlett/color-temperature
         **/

            var unpack$v = utils.unpack;
            var round$6 = Math.round;

            var rgb2temperature = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                var rgb = unpack$v(args, 'rgb');
                var r = rgb[0],
                    b = rgb[2];
                var minTemp = 1000;
                var maxTemp = 40000;
                var eps = 0.4;
                var temp;

                while (maxTemp - minTemp > eps) {
                    temp = (maxTemp + minTemp) * 0.5;
                    var rgb$1 = temperature2rgb_1(temp);

                    if (rgb$1[2] / rgb$1[0] >= b / r) {
                        maxTemp = temp;
                    } else {
                        minTemp = temp;
                    }
                }

                return round$6(temp);
            };

            var rgb2temperature_1 = rgb2temperature;

            Color_1.prototype.temp = Color_1.prototype.kelvin = Color_1.prototype.temperature = function () {
                return rgb2temperature_1(this._rgb);
            };

            chroma_1.temp = chroma_1.kelvin = chroma_1.temperature = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                return new (Function.prototype.bind.apply(Color_1, [null].concat(args, ['temp'])))();
            };

            input.format.temp = input.format.kelvin = input.format.temperature = temperature2rgb_1;
            var type$f = utils.type;

            Color_1.prototype.alpha = function (a, mutate) {
                if (mutate === void 0) mutate = false;

                if (a !== undefined && type$f(a) === 'number') {
                    if (mutate) {
                        this._rgb[3] = a;
                        return this;
                    }

                    return new Color_1([this._rgb[0], this._rgb[1], this._rgb[2], a], 'rgb');
                }

                return this._rgb[3];
            };

            Color_1.prototype.clipped = function () {
                return this._rgb._clipped || false;
            };

            Color_1.prototype.darken = function (amount) {
                if (amount === void 0) amount = 1;
                var me = this;
                var lab = me.lab();
                lab[0] -= labConstants.Kn * amount;
                return new Color_1(lab, 'lab').alpha(me.alpha(), true);
            };

            Color_1.prototype.brighten = function (amount) {
                if (amount === void 0) amount = 1;
                return this.darken(-amount);
            };

            Color_1.prototype.darker = Color_1.prototype.darken;
            Color_1.prototype.brighter = Color_1.prototype.brighten;

            Color_1.prototype.get = function (mc) {
                var ref = mc.split('.');
                var mode = ref[0];
                var channel = ref[1];
                var src = this[mode]();

                if (channel) {
                    var i = mode.indexOf(channel);

                    if (i > -1) {
                        return src[i];
                    }

                    throw new Error("unknown channel " + channel + " in mode " + mode);
                } else {
                    return src;
                }
            };

            var type$g = utils.type;
            var pow$2 = Math.pow;
            var EPS = 1e-7;
            var MAX_ITER = 20;

            Color_1.prototype.luminance = function (lum) {
                if (lum !== undefined && type$g(lum) === 'number') {
                    if (lum === 0) {
                        // return pure black
                        return new Color_1([0, 0, 0, this._rgb[3]], 'rgb');
                    }

                    if (lum === 1) {
                        // return pure white
                        return new Color_1([255, 255, 255, this._rgb[3]], 'rgb');
                    } // compute new color using...


                    var cur_lum = this.luminance();
                    var mode = 'rgb';
                    var max_iter = MAX_ITER;

                    var test = function (low, high) {
                        var mid = low.interpolate(high, 0.5, mode);
                        var lm = mid.luminance();

                        if (Math.abs(lum - lm) < EPS || !max_iter--) {
                            // close enough
                            return mid;
                        }

                        return lm > lum ? test(low, mid) : test(mid, high);
                    };

                    var rgb = (cur_lum > lum ? test(new Color_1([0, 0, 0]), this) : test(this, new Color_1([255, 255, 255]))).rgb();
                    return new Color_1(rgb.concat([this._rgb[3]]));
                }

                return rgb2luminance.apply(void 0, this._rgb.slice(0, 3));
            };

            var rgb2luminance = function (r, g, b) {
                // relative luminance
                // see http://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
                r = luminance_x(r);
                g = luminance_x(g);
                b = luminance_x(b);
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };

            var luminance_x = function (x) {
                x /= 255;
                return x <= 0.03928 ? x / 12.92 : pow$2((x + 0.055) / 1.055, 2.4);
            };

            var interpolator = {};
            var type$h = utils.type;

            var mix = function (col1, col2, f) {
                if (f === void 0) f = 0.5;
                var rest = [],
                    len = arguments.length - 3;

                while (len-- > 0) rest[len] = arguments[len + 3];

                var mode = rest[0] || 'lrgb';

                if (!interpolator[mode] && !rest.length) {
                    // fall back to the first supported mode
                    mode = Object.keys(interpolator)[0];
                }

                if (!interpolator[mode]) {
                    throw new Error("interpolation mode " + mode + " is not defined");
                }

                if (type$h(col1) !== 'object') {
                    col1 = new Color_1(col1);
                }

                if (type$h(col2) !== 'object') {
                    col2 = new Color_1(col2);
                }

                return interpolator[mode](col1, col2, f).alpha(col1.alpha() + f * (col2.alpha() - col1.alpha()));
            };

            Color_1.prototype.mix = Color_1.prototype.interpolate = function (col2, f) {
                if (f === void 0) f = 0.5;
                var rest = [],
                    len = arguments.length - 2;

                while (len-- > 0) rest[len] = arguments[len + 2];

                return mix.apply(void 0, [this, col2, f].concat(rest));
            };

            Color_1.prototype.premultiply = function (mutate) {
                if (mutate === void 0) mutate = false;
                var rgb = this._rgb;
                var a = rgb[3];

                if (mutate) {
                    this._rgb = [rgb[0] * a, rgb[1] * a, rgb[2] * a, a];
                    return this;
                } else {
                    return new Color_1([rgb[0] * a, rgb[1] * a, rgb[2] * a, a], 'rgb');
                }
            };

            Color_1.prototype.saturate = function (amount) {
                if (amount === void 0) amount = 1;
                var me = this;
                var lch = me.lch();
                lch[1] += labConstants.Kn * amount;

                if (lch[1] < 0) {
                    lch[1] = 0;
                }

                return new Color_1(lch, 'lch').alpha(me.alpha(), true);
            };

            Color_1.prototype.desaturate = function (amount) {
                if (amount === void 0) amount = 1;
                return this.saturate(-amount);
            };

            var type$i = utils.type;

            Color_1.prototype.set = function (mc, value, mutate) {
                if (mutate === void 0) mutate = false;
                var ref = mc.split('.');
                var mode = ref[0];
                var channel = ref[1];
                var src = this[mode]();

                if (channel) {
                    var i = mode.indexOf(channel);

                    if (i > -1) {
                        if (type$i(value) == 'string') {
                            switch (value.charAt(0)) {
                                case '+':
                                    src[i] += +value;
                                    break;

                                case '-':
                                    src[i] += +value;
                                    break;

                                case '*':
                                    src[i] *= +value.substr(1);
                                    break;

                                case '/':
                                    src[i] /= +value.substr(1);
                                    break;

                                default:
                                    src[i] = +value;
                            }
                        } else if (type$i(value) === 'number') {
                            src[i] = value;
                        } else {
                            throw new Error("unsupported value for Color.set");
                        }

                        var out = new Color_1(src, mode);

                        if (mutate) {
                            this._rgb = out._rgb;
                            return this;
                        }

                        return out;
                    }

                    throw new Error("unknown channel " + channel + " in mode " + mode);
                } else {
                    return src;
                }
            };

            var rgb$1 = function (col1, col2, f) {
                var xyz0 = col1._rgb;
                var xyz1 = col2._rgb;
                return new Color_1(xyz0[0] + f * (xyz1[0] - xyz0[0]), xyz0[1] + f * (xyz1[1] - xyz0[1]), xyz0[2] + f * (xyz1[2] - xyz0[2]), 'rgb');
            }; // register interpolator


            interpolator.rgb = rgb$1;
            var sqrt$2 = Math.sqrt;
            var pow$3 = Math.pow;

            var lrgb = function (col1, col2, f) {
                var ref = col1._rgb;
                var x1 = ref[0];
                var y1 = ref[1];
                var z1 = ref[2];
                var ref$1 = col2._rgb;
                var x2 = ref$1[0];
                var y2 = ref$1[1];
                var z2 = ref$1[2];
                return new Color_1(sqrt$2(pow$3(x1, 2) * (1 - f) + pow$3(x2, 2) * f), sqrt$2(pow$3(y1, 2) * (1 - f) + pow$3(y2, 2) * f), sqrt$2(pow$3(z1, 2) * (1 - f) + pow$3(z2, 2) * f), 'rgb');
            }; // register interpolator


            interpolator.lrgb = lrgb;

            var lab$1 = function (col1, col2, f) {
                var xyz0 = col1.lab();
                var xyz1 = col2.lab();
                return new Color_1(xyz0[0] + f * (xyz1[0] - xyz0[0]), xyz0[1] + f * (xyz1[1] - xyz0[1]), xyz0[2] + f * (xyz1[2] - xyz0[2]), 'lab');
            }; // register interpolator


            interpolator.lab = lab$1;

            var _hsx = function (col1, col2, f, m) {
                var assign, assign$1;
                var xyz0, xyz1;

                if (m === 'hsl') {
                    xyz0 = col1.hsl();
                    xyz1 = col2.hsl();
                } else if (m === 'hsv') {
                    xyz0 = col1.hsv();
                    xyz1 = col2.hsv();
                } else if (m === 'hcg') {
                    xyz0 = col1.hcg();
                    xyz1 = col2.hcg();
                } else if (m === 'hsi') {
                    xyz0 = col1.hsi();
                    xyz1 = col2.hsi();
                } else if (m === 'lch' || m === 'hcl') {
                    m = 'hcl';
                    xyz0 = col1.hcl();
                    xyz1 = col2.hcl();
                }

                var hue0, hue1, sat0, sat1, lbv0, lbv1;

                if (m.substr(0, 1) === 'h') {
                    assign = xyz0, hue0 = assign[0], sat0 = assign[1], lbv0 = assign[2];
                    assign$1 = xyz1, hue1 = assign$1[0], sat1 = assign$1[1], lbv1 = assign$1[2];
                }

                var sat, hue, lbv, dh;

                if (!isNaN(hue0) && !isNaN(hue1)) {
                    // both colors have hue
                    if (hue1 > hue0 && hue1 - hue0 > 180) {
                        dh = hue1 - (hue0 + 360);
                    } else if (hue1 < hue0 && hue0 - hue1 > 180) {
                        dh = hue1 + 360 - hue0;
                    } else {
                        dh = hue1 - hue0;
                    }

                    hue = hue0 + f * dh;
                } else if (!isNaN(hue0)) {
                    hue = hue0;

                    if ((lbv1 == 1 || lbv1 == 0) && m != 'hsv') {
                        sat = sat0;
                    }
                } else if (!isNaN(hue1)) {
                    hue = hue1;

                    if ((lbv0 == 1 || lbv0 == 0) && m != 'hsv') {
                        sat = sat1;
                    }
                } else {
                    hue = Number.NaN;
                }

                if (sat === undefined) {
                    sat = sat0 + f * (sat1 - sat0);
                }

                lbv = lbv0 + f * (lbv1 - lbv0);
                return new Color_1([hue, sat, lbv], m);
            };

            var lch$1 = function (col1, col2, f) {
                return _hsx(col1, col2, f, 'lch');
            }; // register interpolator


            interpolator.lch = lch$1;
            interpolator.hcl = lch$1;

            var num$1 = function (col1, col2, f) {
                var c1 = col1.num();
                var c2 = col2.num();
                return new Color_1(c1 + f * (c2 - c1), 'num');
            }; // register interpolator


            interpolator.num = num$1;

            var hcg$1 = function (col1, col2, f) {
                return _hsx(col1, col2, f, 'hcg');
            }; // register interpolator


            interpolator.hcg = hcg$1;

            var hsi$1 = function (col1, col2, f) {
                return _hsx(col1, col2, f, 'hsi');
            }; // register interpolator


            interpolator.hsi = hsi$1;

            var hsl$1 = function (col1, col2, f) {
                return _hsx(col1, col2, f, 'hsl');
            }; // register interpolator


            interpolator.hsl = hsl$1;

            var hsv$1 = function (col1, col2, f) {
                return _hsx(col1, col2, f, 'hsv');
            }; // register interpolator


            interpolator.hsv = hsv$1;
            var clip_rgb$2 = utils.clip_rgb;
            var pow$4 = Math.pow;
            var sqrt$3 = Math.sqrt;
            var PI$1 = Math.PI;
            var cos$2 = Math.cos;
            var sin$1 = Math.sin;
            var atan2$1 = Math.atan2;

            var average = function (colors, mode, weights) {
                if (mode === void 0) mode = 'lrgb';
                if (weights === void 0) weights = null;
                var l = colors.length;

                if (!weights) {
                    weights = Array.from(new Array(l)).map(function () {
                        return 1;
                    });
                } // normalize weights


                var k = l / weights.reduce(function (a, b) {
                    return a + b;
                });
                weights.forEach(function (w, i) {
                    weights[i] *= k;
                }); // convert colors to Color objects

                colors = colors.map(function (c) {
                    return new Color_1(c);
                });

                if (mode === 'lrgb') {
                    return _average_lrgb(colors, weights);
                }

                var first = colors.shift();
                var xyz = first.get(mode);
                var cnt = [];
                var dx = 0;
                var dy = 0; // initial color

                for (var i = 0; i < xyz.length; i++) {
                    xyz[i] = (xyz[i] || 0) * weights[0];
                    cnt.push(isNaN(xyz[i]) ? 0 : weights[0]);

                    if (mode.charAt(i) === 'h' && !isNaN(xyz[i])) {
                        var A = xyz[i] / 180 * PI$1;
                        dx += cos$2(A) * weights[0];
                        dy += sin$1(A) * weights[0];
                    }
                }

                var alpha = first.alpha() * weights[0];
                colors.forEach(function (c, ci) {
                    var xyz2 = c.get(mode);
                    alpha += c.alpha() * weights[ci + 1];

                    for (var i = 0; i < xyz.length; i++) {
                        if (!isNaN(xyz2[i])) {
                            cnt[i] += weights[ci + 1];

                            if (mode.charAt(i) === 'h') {
                                var A = xyz2[i] / 180 * PI$1;
                                dx += cos$2(A) * weights[ci + 1];
                                dy += sin$1(A) * weights[ci + 1];
                            } else {
                                xyz[i] += xyz2[i] * weights[ci + 1];
                            }
                        }
                    }
                });

                for (var i$1 = 0; i$1 < xyz.length; i$1++) {
                    if (mode.charAt(i$1) === 'h') {
                        var A$1 = atan2$1(dy / cnt[i$1], dx / cnt[i$1]) / PI$1 * 180;

                        while (A$1 < 0) {
                            A$1 += 360;
                        }

                        while (A$1 >= 360) {
                            A$1 -= 360;
                        }

                        xyz[i$1] = A$1;
                    } else {
                        xyz[i$1] = xyz[i$1] / cnt[i$1];
                    }
                }

                alpha /= l;
                return new Color_1(xyz, mode).alpha(alpha > 0.99999 ? 1 : alpha, true);
            };

            var _average_lrgb = function (colors, weights) {
                var l = colors.length;
                var xyz = [0, 0, 0, 0];

                for (var i = 0; i < colors.length; i++) {
                    var col = colors[i];
                    var f = weights[i] / l;
                    var rgb = col._rgb;
                    xyz[0] += pow$4(rgb[0], 2) * f;
                    xyz[1] += pow$4(rgb[1], 2) * f;
                    xyz[2] += pow$4(rgb[2], 2) * f;
                    xyz[3] += rgb[3] * f;
                }

                xyz[0] = sqrt$3(xyz[0]);
                xyz[1] = sqrt$3(xyz[1]);
                xyz[2] = sqrt$3(xyz[2]);

                if (xyz[3] > 0.9999999) {
                    xyz[3] = 1;
                }

                return new Color_1(clip_rgb$2(xyz));
            }; // minimal multi-purpose interface
            // @requires utils color analyze


            var type$j = utils.type;
            var pow$5 = Math.pow;

            var scale = function (colors) {
                // constructor
                var _mode = 'rgb';

                var _nacol = chroma_1('#ccc');

                var _spread = 0; // const _fixed = false;

                var _domain = [0, 1];
                var _pos = [];
                var _padding = [0, 0];
                var _classes = false;
                var _colors = [];
                var _out = false;
                var _min = 0;
                var _max = 1;
                var _correctLightness = false;
                var _colorCache = {};
                var _useCache = true;
                var _gamma = 1; // private methods

                var setColors = function (colors) {
                    colors = colors || ['#fff', '#000'];

                    if (colors && type$j(colors) === 'string' && chroma_1.brewer && chroma_1.brewer[colors.toLowerCase()]) {
                        colors = chroma_1.brewer[colors.toLowerCase()];
                    }

                    if (type$j(colors) === 'array') {
                        // handle single color
                        if (colors.length === 1) {
                            colors = [colors[0], colors[0]];
                        } // make a copy of the colors


                        colors = colors.slice(0); // convert to chroma classes

                        for (var c = 0; c < colors.length; c++) {
                            colors[c] = chroma_1(colors[c]);
                        } // auto-fill color position


                        _pos.length = 0;

                        for (var c$1 = 0; c$1 < colors.length; c$1++) {
                            _pos.push(c$1 / (colors.length - 1));
                        }
                    }

                    resetCache();
                    return _colors = colors;
                };

                var getClass = function (value) {
                    if (_classes != null) {
                        var n = _classes.length - 1;
                        var i = 0;

                        while (i < n && value >= _classes[i]) {
                            i++;
                        }

                        return i - 1;
                    }

                    return 0;
                };

                var tMapLightness = function (t) {
                    return t;
                };

                var tMapDomain = function (t) {
                    return t;
                }; // const classifyValue = function(value) {
                //     let val = value;
                //     if (_classes.length > 2) {
                //         const n = _classes.length-1;
                //         const i = getClass(value);
                //         const minc = _classes[0] + ((_classes[1]-_classes[0]) * (0 + (_spread * 0.5)));  // center of 1st class
                //         const maxc = _classes[n-1] + ((_classes[n]-_classes[n-1]) * (1 - (_spread * 0.5)));  // center of last class
                //         val = _min + ((((_classes[i] + ((_classes[i+1] - _classes[i]) * 0.5)) - minc) / (maxc-minc)) * (_max - _min));
                //     }
                //     return val;
                // };


                var getColor = function (val, bypassMap) {
                    var col, t;

                    if (bypassMap == null) {
                        bypassMap = false;
                    }

                    if (isNaN(val) || val === null) {
                        return _nacol;
                    }

                    if (!bypassMap) {
                        if (_classes && _classes.length > 2) {
                            // find the class
                            var c = getClass(val);
                            t = c / (_classes.length - 2);
                        } else if (_max !== _min) {
                            // just interpolate between min/max
                            t = (val - _min) / (_max - _min);
                        } else {
                            t = 1;
                        }
                    } else {
                        t = val;
                    } // domain map


                    t = tMapDomain(t);

                    if (!bypassMap) {
                        t = tMapLightness(t); // lightness correction
                    }

                    if (_gamma !== 1) {
                        t = pow$5(t, _gamma);
                    }

                    t = _padding[0] + t * (1 - _padding[0] - _padding[1]);
                    t = Math.min(1, Math.max(0, t));
                    var k = Math.floor(t * 10000);

                    if (_useCache && _colorCache[k]) {
                        col = _colorCache[k];
                    } else {
                        if (type$j(_colors) === 'array') {
                            //for i in [0.._pos.length-1]
                            for (var i = 0; i < _pos.length; i++) {
                                var p = _pos[i];

                                if (t <= p) {
                                    col = _colors[i];
                                    break;
                                }

                                if (t >= p && i === _pos.length - 1) {
                                    col = _colors[i];
                                    break;
                                }

                                if (t > p && t < _pos[i + 1]) {
                                    t = (t - p) / (_pos[i + 1] - p);
                                    col = chroma_1.interpolate(_colors[i], _colors[i + 1], t, _mode);
                                    break;
                                }
                            }
                        } else if (type$j(_colors) === 'function') {
                            col = _colors(t);
                        }

                        if (_useCache) {
                            _colorCache[k] = col;
                        }
                    }

                    return col;
                };

                var resetCache = function () {
                    return _colorCache = {};
                };

                setColors(colors); // public interface

                var f = function (v) {
                    var c = chroma_1(getColor(v));

                    if (_out && c[_out]) {
                        return c[_out]();
                    } else {
                        return c;
                    }
                };

                f.classes = function (classes) {
                    if (classes != null) {
                        if (type$j(classes) === 'array') {
                            _classes = classes;
                            _domain = [classes[0], classes[classes.length - 1]];
                        } else {
                            var d = chroma_1.analyze(_domain);

                            if (classes === 0) {
                                _classes = [d.min, d.max];
                            } else {
                                _classes = chroma_1.limits(d, 'e', classes);
                            }
                        }

                        return f;
                    }

                    return _classes;
                };

                f.domain = function (domain) {
                    if (!arguments.length) {
                        return _domain;
                    }

                    _min = domain[0];
                    _max = domain[domain.length - 1];
                    _pos = [];
                    var k = _colors.length;

                    if (domain.length === k && _min !== _max) {
                        // update positions
                        for (var i = 0, list = Array.from(domain); i < list.length; i += 1) {
                            var d = list[i];

                            _pos.push((d - _min) / (_max - _min));
                        }
                    } else {
                        for (var c = 0; c < k; c++) {
                            _pos.push(c / (k - 1));
                        }

                        if (domain.length > 2) {
                            // set domain map
                            var tOut = domain.map(function (d, i) {
                                return i / (domain.length - 1);
                            });
                            var tBreaks = domain.map(function (d) {
                                return (d - _min) / (_max - _min);
                            });

                            if (!tBreaks.every(function (val, i) {
                                return tOut[i] === val;
                            })) {
                                tMapDomain = function (t) {
                                    if (t <= 0 || t >= 1) {
                                        return t;
                                    }

                                    var i = 0;

                                    while (t >= tBreaks[i + 1]) {
                                        i++;
                                    }

                                    var f = (t - tBreaks[i]) / (tBreaks[i + 1] - tBreaks[i]);
                                    var out = tOut[i] + f * (tOut[i + 1] - tOut[i]);
                                    return out;
                                };
                            }
                        }
                    }

                    _domain = [_min, _max];
                    return f;
                };

                f.mode = function (_m) {
                    if (!arguments.length) {
                        return _mode;
                    }

                    _mode = _m;
                    resetCache();
                    return f;
                };

                f.range = function (colors, _pos) {
                    setColors(colors);
                    return f;
                };

                f.out = function (_o) {
                    _out = _o;
                    return f;
                };

                f.spread = function (val) {
                    if (!arguments.length) {
                        return _spread;
                    }

                    _spread = val;
                    return f;
                };

                f.correctLightness = function (v) {
                    if (v == null) {
                        v = true;
                    }

                    _correctLightness = v;
                    resetCache();

                    if (_correctLightness) {
                        tMapLightness = function (t) {
                            var L0 = getColor(0, true).lab()[0];
                            var L1 = getColor(1, true).lab()[0];
                            var pol = L0 > L1;
                            var L_actual = getColor(t, true).lab()[0];
                            var L_ideal = L0 + (L1 - L0) * t;
                            var L_diff = L_actual - L_ideal;
                            var t0 = 0;
                            var t1 = 1;
                            var max_iter = 20;

                            while (Math.abs(L_diff) > 1e-2 && max_iter-- > 0) {
                                (function () {
                                    if (pol) {
                                        L_diff *= -1;
                                    }

                                    if (L_diff < 0) {
                                        t0 = t;
                                        t += (t1 - t) * 0.5;
                                    } else {
                                        t1 = t;
                                        t += (t0 - t) * 0.5;
                                    }

                                    L_actual = getColor(t, true).lab()[0];
                                    return L_diff = L_actual - L_ideal;
                                })();
                            }

                            return t;
                        };
                    } else {
                        tMapLightness = function (t) {
                            return t;
                        };
                    }

                    return f;
                };

                f.padding = function (p) {
                    if (p != null) {
                        if (type$j(p) === 'number') {
                            p = [p, p];
                        }

                        _padding = p;
                        return f;
                    } else {
                        return _padding;
                    }
                };

                f.colors = function (numColors, out) {
                    // If no arguments are given, return the original colors that were provided
                    if (arguments.length < 2) {
                        out = 'hex';
                    }

                    var result = [];

                    if (arguments.length === 0) {
                        result = _colors.slice(0);
                    } else if (numColors === 1) {
                        result = [f(0.5)];
                    } else if (numColors > 1) {
                        var dm = _domain[0];
                        var dd = _domain[1] - dm;
                        result = __range__(0, numColors, false).map(function (i) {
                            return f(dm + i / (numColors - 1) * dd);
                        });
                    } else {
                        // returns all colors based on the defined classes
                        colors = [];
                        var samples = [];

                        if (_classes && _classes.length > 2) {
                            for (var i = 1, end = _classes.length, asc = 1 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                                samples.push((_classes[i - 1] + _classes[i]) * 0.5);
                            }
                        } else {
                            samples = _domain;
                        }

                        result = samples.map(function (v) {
                            return f(v);
                        });
                    }

                    if (chroma_1[out]) {
                        result = result.map(function (c) {
                            return c[out]();
                        });
                    }

                    return result;
                };

                f.cache = function (c) {
                    if (c != null) {
                        _useCache = c;
                        return f;
                    } else {
                        return _useCache;
                    }
                };

                f.gamma = function (g) {
                    if (g != null) {
                        _gamma = g;
                        return f;
                    } else {
                        return _gamma;
                    }
                };

                f.nodata = function (d) {
                    if (d != null) {
                        _nacol = chroma_1(d);
                        return f;
                    } else {
                        return _nacol;
                    }
                };

                return f;
            };

            function __range__(left, right, inclusive) {
                var range = [];
                var ascending = left < right;
                var end = !inclusive ? right : ascending ? right + 1 : right - 1;

                for (var i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
                    range.push(i);
                }

                return range;
            } //
            // interpolates between a set of colors uzing a bezier spline
            //
            // @requires utils lab


            var bezier = function (colors) {
                var assign, assign$1, assign$2;
                var I, lab0, lab1, lab2;
                colors = colors.map(function (c) {
                    return new Color_1(c);
                });

                if (colors.length === 2) {
                    // linear interpolation
                    assign = colors.map(function (c) {
                        return c.lab();
                    }), lab0 = assign[0], lab1 = assign[1];

                    I = function (t) {
                        var lab = [0, 1, 2].map(function (i) {
                            return lab0[i] + t * (lab1[i] - lab0[i]);
                        });
                        return new Color_1(lab, 'lab');
                    };
                } else if (colors.length === 3) {
                    // quadratic bezier interpolation
                    assign$1 = colors.map(function (c) {
                        return c.lab();
                    }), lab0 = assign$1[0], lab1 = assign$1[1], lab2 = assign$1[2];

                    I = function (t) {
                        var lab = [0, 1, 2].map(function (i) {
                            return (1 - t) * (1 - t) * lab0[i] + 2 * (1 - t) * t * lab1[i] + t * t * lab2[i];
                        });
                        return new Color_1(lab, 'lab');
                    };
                } else if (colors.length === 4) {
                    // cubic bezier interpolation
                    var lab3;
                    assign$2 = colors.map(function (c) {
                        return c.lab();
                    }), lab0 = assign$2[0], lab1 = assign$2[1], lab2 = assign$2[2], lab3 = assign$2[3];

                    I = function (t) {
                        var lab = [0, 1, 2].map(function (i) {
                            return (1 - t) * (1 - t) * (1 - t) * lab0[i] + 3 * (1 - t) * (1 - t) * t * lab1[i] + 3 * (1 - t) * t * t * lab2[i] + t * t * t * lab3[i];
                        });
                        return new Color_1(lab, 'lab');
                    };
                } else if (colors.length === 5) {
                    var I0 = bezier(colors.slice(0, 3));
                    var I1 = bezier(colors.slice(2, 5));

                    I = function (t) {
                        if (t < 0.5) {
                            return I0(t * 2);
                        } else {
                            return I1((t - 0.5) * 2);
                        }
                    };
                }

                return I;
            };

            var bezier_1 = function (colors) {
                var f = bezier(colors);

                f.scale = function () {
                    return scale(f);
                };

                return f;
            };
            /*
         * interpolates between a set of colors uzing a bezier spline
         * blend mode formulas taken from http://www.venture-ware.com/kevin/coding/lets-learn-math-photoshop-blend-modes/
         */


            var blend = function (bottom, top, mode) {
                if (!blend[mode]) {
                    throw new Error('unknown blend mode ' + mode);
                }

                return blend[mode](bottom, top);
            };

            var blend_f = function (f) {
                return function (bottom, top) {
                    var c0 = chroma_1(top).rgb();
                    var c1 = chroma_1(bottom).rgb();
                    return chroma_1.rgb(f(c0, c1));
                };
            };

            var each = function (f) {
                return function (c0, c1) {
                    var out = [];
                    out[0] = f(c0[0], c1[0]);
                    out[1] = f(c0[1], c1[1]);
                    out[2] = f(c0[2], c1[2]);
                    return out;
                };
            };

            var normal = function (a) {
                return a;
            };

            var multiply = function (a, b) {
                return a * b / 255;
            };

            var darken$1 = function (a, b) {
                return a > b ? b : a;
            };

            var lighten = function (a, b) {
                return a > b ? a : b;
            };

            var screen = function (a, b) {
                return 255 * (1 - (1 - a / 255) * (1 - b / 255));
            };

            var overlay = function (a, b) {
                return b < 128 ? 2 * a * b / 255 : 255 * (1 - 2 * (1 - a / 255) * (1 - b / 255));
            };

            var burn = function (a, b) {
                return 255 * (1 - (1 - b / 255) / (a / 255));
            };

            var dodge = function (a, b) {
                if (a === 255) {
                    return 255;
                }

                a = 255 * (b / 255) / (1 - a / 255);
                return a > 255 ? 255 : a;
            }; // # add = (a,b) ->
            // #     if (a + b > 255) then 255 else a + b


            blend.normal = blend_f(each(normal));
            blend.multiply = blend_f(each(multiply));
            blend.screen = blend_f(each(screen));
            blend.overlay = blend_f(each(overlay));
            blend.darken = blend_f(each(darken$1));
            blend.lighten = blend_f(each(lighten));
            blend.dodge = blend_f(each(dodge));
            blend.burn = blend_f(each(burn)); // blend.add = blend_f(each(add));

            var blend_1 = blend; // cubehelix interpolation
            // based on D.A. Green "A colour scheme for the display of astronomical intensity images"
            // http://astron-soc.in/bulletin/11June/289392011.pdf

            var type$k = utils.type;
            var clip_rgb$3 = utils.clip_rgb;
            var TWOPI$2 = utils.TWOPI;
            var pow$6 = Math.pow;
            var sin$2 = Math.sin;
            var cos$3 = Math.cos;

            var cubehelix = function (start, rotations, hue, gamma, lightness) {
                if (start === void 0) start = 300;
                if (rotations === void 0) rotations = -1.5;
                if (hue === void 0) hue = 1;
                if (gamma === void 0) gamma = 1;
                if (lightness === void 0) lightness = [0, 1];
                var dh = 0,
                    dl;

                if (type$k(lightness) === 'array') {
                    dl = lightness[1] - lightness[0];
                } else {
                    dl = 0;
                    lightness = [lightness, lightness];
                }

                var f = function (fract) {
                    var a = TWOPI$2 * ((start + 120) / 360 + rotations * fract);
                    var l = pow$6(lightness[0] + dl * fract, gamma);
                    var h = dh !== 0 ? hue[0] + fract * dh : hue;
                    var amp = h * l * (1 - l) / 2;
                    var cos_a = cos$3(a);
                    var sin_a = sin$2(a);
                    var r = l + amp * (-0.14861 * cos_a + 1.78277 * sin_a);
                    var g = l + amp * (-0.29227 * cos_a - 0.90649 * sin_a);
                    var b = l + amp * (+1.97294 * cos_a);
                    return chroma_1(clip_rgb$3([r * 255, g * 255, b * 255, 1]));
                };

                f.start = function (s) {
                    if (s == null) {
                        return start;
                    }

                    start = s;
                    return f;
                };

                f.rotations = function (r) {
                    if (r == null) {
                        return rotations;
                    }

                    rotations = r;
                    return f;
                };

                f.gamma = function (g) {
                    if (g == null) {
                        return gamma;
                    }

                    gamma = g;
                    return f;
                };

                f.hue = function (h) {
                    if (h == null) {
                        return hue;
                    }

                    hue = h;

                    if (type$k(hue) === 'array') {
                        dh = hue[1] - hue[0];

                        if (dh === 0) {
                            hue = hue[1];
                        }
                    } else {
                        dh = 0;
                    }

                    return f;
                };

                f.lightness = function (h) {
                    if (h == null) {
                        return lightness;
                    }

                    if (type$k(h) === 'array') {
                        lightness = h;
                        dl = h[1] - h[0];
                    } else {
                        lightness = [h, h];
                        dl = 0;
                    }

                    return f;
                };

                f.scale = function () {
                    return chroma_1.scale(f);
                };

                f.hue(hue);
                return f;
            };

            var digits = '0123456789abcdef';
            var floor$2 = Math.floor;
            var random = Math.random;

            var random_1 = function () {
                var code = '#';

                for (var i = 0; i < 6; i++) {
                    code += digits.charAt(floor$2(random() * 16));
                }

                return new Color_1(code, 'hex');
            };

            var log$1 = Math.log;
            var pow$7 = Math.pow;
            var floor$3 = Math.floor;
            var abs = Math.abs;

            var analyze = function (data, key) {
                if (key === void 0) key = null;
                var r = {
                    min: Number.MAX_VALUE,
                    max: Number.MAX_VALUE * -1,
                    sum: 0,
                    values: [],
                    count: 0
                };

                if (type(data) === 'object') {
                    data = Object.values(data);
                }

                data.forEach(function (val) {
                    if (key && type(val) === 'object') {
                        val = val[key];
                    }

                    if (val !== undefined && val !== null && !isNaN(val)) {
                        r.values.push(val);
                        r.sum += val;

                        if (val < r.min) {
                            r.min = val;
                        }

                        if (val > r.max) {
                            r.max = val;
                        }

                        r.count += 1;
                    }
                });
                r.domain = [r.min, r.max];

                r.limits = function (mode, num) {
                    return limits(r, mode, num);
                };

                return r;
            };

            var limits = function (data, mode, num) {
                if (mode === void 0) mode = 'equal';
                if (num === void 0) num = 7;

                if (type(data) == 'array') {
                    data = analyze(data);
                }

                var min = data.min;
                var max = data.max;
                var values = data.values.sort(function (a, b) {
                    return a - b;
                });

                if (num === 1) {
                    return [min, max];
                }

                var limits = [];

                if (mode.substr(0, 1) === 'c') {
                    // continuous
                    limits.push(min);
                    limits.push(max);
                }

                if (mode.substr(0, 1) === 'e') {
                    // equal interval
                    limits.push(min);

                    for (var i = 1; i < num; i++) {
                        limits.push(min + i / num * (max - min));
                    }

                    limits.push(max);
                } else if (mode.substr(0, 1) === 'l') {
                    // log scale
                    if (min <= 0) {
                        throw new Error('Logarithmic scales are only possible for values > 0');
                    }

                    var min_log = Math.LOG10E * log$1(min);
                    var max_log = Math.LOG10E * log$1(max);
                    limits.push(min);

                    for (var i$1 = 1; i$1 < num; i$1++) {
                        limits.push(pow$7(10, min_log + i$1 / num * (max_log - min_log)));
                    }

                    limits.push(max);
                } else if (mode.substr(0, 1) === 'q') {
                    // quantile scale
                    limits.push(min);

                    for (var i$2 = 1; i$2 < num; i$2++) {
                        var p = (values.length - 1) * i$2 / num;
                        var pb = floor$3(p);

                        if (pb === p) {
                            limits.push(values[pb]);
                        } else {
                            // p > pb
                            var pr = p - pb;
                            limits.push(values[pb] * (1 - pr) + values[pb + 1] * pr);
                        }
                    }

                    limits.push(max);
                } else if (mode.substr(0, 1) === 'k') {
                    // k-means clustering

                    /*
            implementation based on
            http://code.google.com/p/figue/source/browse/trunk/figue.js#336
            simplified for 1-d input values
            */
                    var cluster;
                    var n = values.length;
                    var assignments = new Array(n);
                    var clusterSizes = new Array(num);
                    var repeat = true;
                    var nb_iters = 0;
                    var centroids = null; // get seed values

                    centroids = [];
                    centroids.push(min);

                    for (var i$3 = 1; i$3 < num; i$3++) {
                        centroids.push(min + i$3 / num * (max - min));
                    }

                    centroids.push(max);

                    while (repeat) {
                        // assignment step
                        for (var j = 0; j < num; j++) {
                            clusterSizes[j] = 0;
                        }

                        for (var i$4 = 0; i$4 < n; i$4++) {
                            var value = values[i$4];
                            var mindist = Number.MAX_VALUE;
                            var best = void 0;

                            for (var j$1 = 0; j$1 < num; j$1++) {
                                var dist = abs(centroids[j$1] - value);

                                if (dist < mindist) {
                                    mindist = dist;
                                    best = j$1;
                                }

                                clusterSizes[best]++;
                                assignments[i$4] = best;
                            }
                        } // update centroids step


                        var newCentroids = new Array(num);

                        for (var j$2 = 0; j$2 < num; j$2++) {
                            newCentroids[j$2] = null;
                        }

                        for (var i$5 = 0; i$5 < n; i$5++) {
                            cluster = assignments[i$5];

                            if (newCentroids[cluster] === null) {
                                newCentroids[cluster] = values[i$5];
                            } else {
                                newCentroids[cluster] += values[i$5];
                            }
                        }

                        for (var j$3 = 0; j$3 < num; j$3++) {
                            newCentroids[j$3] *= 1 / clusterSizes[j$3];
                        } // check convergence


                        repeat = false;

                        for (var j$4 = 0; j$4 < num; j$4++) {
                            if (newCentroids[j$4] !== centroids[j$4]) {
                                repeat = true;
                                break;
                            }
                        }

                        centroids = newCentroids;
                        nb_iters++;

                        if (nb_iters > 200) {
                            repeat = false;
                        }
                    } // finished k-means clustering
                    // the next part is borrowed from gabrielflor.it


                    var kClusters = {};

                    for (var j$5 = 0; j$5 < num; j$5++) {
                        kClusters[j$5] = [];
                    }

                    for (var i$6 = 0; i$6 < n; i$6++) {
                        cluster = assignments[i$6];
                        kClusters[cluster].push(values[i$6]);
                    }

                    var tmpKMeansBreaks = [];

                    for (var j$6 = 0; j$6 < num; j$6++) {
                        tmpKMeansBreaks.push(kClusters[j$6][0]);
                        tmpKMeansBreaks.push(kClusters[j$6][kClusters[j$6].length - 1]);
                    }

                    tmpKMeansBreaks = tmpKMeansBreaks.sort(function (a, b) {
                        return a - b;
                    });
                    limits.push(tmpKMeansBreaks[0]);

                    for (var i$7 = 1; i$7 < tmpKMeansBreaks.length; i$7 += 2) {
                        var v = tmpKMeansBreaks[i$7];

                        if (!isNaN(v) && limits.indexOf(v) === -1) {
                            limits.push(v);
                        }
                    }
                }

                return limits;
            };

            var analyze_1 = {
                analyze: analyze,
                limits: limits
            };

            var contrast = function (a, b) {
                // WCAG contrast ratio
                // see http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
                a = new Color_1(a);
                b = new Color_1(b);
                var l1 = a.luminance();
                var l2 = b.luminance();
                return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
            };

            var sqrt$4 = Math.sqrt;
            var atan2$2 = Math.atan2;
            var abs$1 = Math.abs;
            var cos$4 = Math.cos;
            var PI$2 = Math.PI;

            var deltaE = function (a, b, L, C) {
                if (L === void 0) L = 1;
                if (C === void 0) C = 1; // Delta E (CMC)
                // see http://www.brucelindbloom.com/index.html?Eqn_DeltaE_CMC.html

                a = new Color_1(a);
                b = new Color_1(b);
                var ref = Array.from(a.lab());
                var L1 = ref[0];
                var a1 = ref[1];
                var b1 = ref[2];
                var ref$1 = Array.from(b.lab());
                var L2 = ref$1[0];
                var a2 = ref$1[1];
                var b2 = ref$1[2];
                var c1 = sqrt$4(a1 * a1 + b1 * b1);
                var c2 = sqrt$4(a2 * a2 + b2 * b2);
                var sl = L1 < 16.0 ? 0.511 : 0.040975 * L1 / (1.0 + 0.01765 * L1);
                var sc = 0.0638 * c1 / (1.0 + 0.0131 * c1) + 0.638;
                var h1 = c1 < 0.000001 ? 0.0 : atan2$2(b1, a1) * 180.0 / PI$2;

                while (h1 < 0) {
                    h1 += 360;
                }

                while (h1 >= 360) {
                    h1 -= 360;
                }

                var t = h1 >= 164.0 && h1 <= 345.0 ? 0.56 + abs$1(0.2 * cos$4(PI$2 * (h1 + 168.0) / 180.0)) : 0.36 + abs$1(0.4 * cos$4(PI$2 * (h1 + 35.0) / 180.0));
                var c4 = c1 * c1 * c1 * c1;
                var f = sqrt$4(c4 / (c4 + 1900.0));
                var sh = sc * (f * t + 1.0 - f);
                var delL = L1 - L2;
                var delC = c1 - c2;
                var delA = a1 - a2;
                var delB = b1 - b2;
                var dH2 = delA * delA + delB * delB - delC * delC;
                var v1 = delL / (L * sl);
                var v2 = delC / (C * sc);
                var v3 = sh;
                return sqrt$4(v1 * v1 + v2 * v2 + dH2 / (v3 * v3));
            }; // simple Euclidean distance


            var distance = function (a, b, mode) {
                if (mode === void 0) mode = 'lab'; // Delta E (CIE 1976)
                // see http://www.brucelindbloom.com/index.html?Equations.html

                a = new Color_1(a);
                b = new Color_1(b);
                var l1 = a.get(mode);
                var l2 = b.get(mode);
                var sum_sq = 0;

                for (var i in l1) {
                    var d = (l1[i] || 0) - (l2[i] || 0);
                    sum_sq += d * d;
                }

                return Math.sqrt(sum_sq);
            };

            var valid = function () {
                var args = [],
                    len = arguments.length;

                while (len--) args[len] = arguments[len];

                try {
                    new (Function.prototype.bind.apply(Color_1, [null].concat(args)))();
                    return true;
                } catch (e) {
                    return false;
                }
            }; // some pre-defined color scales:


            var scales = {
                cool: function cool() {
                    return scale([chroma_1.hsl(180, 1, .9), chroma_1.hsl(250, .7, .4)]);
                },
                hot: function hot() {
                    return scale(['#000', '#f00', '#ff0', '#fff']).mode('rgb');
                }
            };
            /**
             ColorBrewer colors for chroma.js
             Copyright (c) 2002 Cynthia Brewer, Mark Harrower, and The
             Pennsylvania State University.
             Licensed under the Apache License, Version 2.0 (the "License");
             you may not use this file except in compliance with the License.
             You may obtain a copy of the License at
             http://www.apache.org/licenses/LICENSE-2.0
             Unless required by applicable law or agreed to in writing, software distributed
             under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
             CONDITIONS OF ANY KIND, either express or implied. See the License for the
             specific language governing permissions and limitations under the License.
             */

            var colorbrewer = {
                // sequential
                OrRd: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#b30000', '#7f0000'],
                PuBu: ['#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#045a8d', '#023858'],
                BuPu: ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#810f7c', '#4d004b'],
                Oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
                BuGn: ['#f7fcfd', '#e5f5f9', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#006d2c', '#00441b'],
                YlOrBr: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#993404', '#662506'],
                YlGn: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'],
                Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
                RdPu: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177', '#49006a'],
                Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
                YlGnBu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'],
                Purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
                GnBu: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'],
                Greys: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'],
                YlOrRd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
                PuRd: ['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#980043', '#67001f'],
                Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
                PuBuGn: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636'],
                Viridis: ['#440154', '#482777', '#3f4a8a', '#31678e', '#26838f', '#1f9d8a', '#6cce5a', '#b6de2b', '#fee825'],
                // diverging
                Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
                RdYlGn: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'],
                RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
                PiYG: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419'],
                PRGn: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837', '#00441b'],
                RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
                BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
                RdGy: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#ffffff', '#e0e0e0', '#bababa', '#878787', '#4d4d4d', '#1a1a1a'],
                PuOr: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'],
                // qualitative
                Set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
                Accent: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'],
                Set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
                Set3: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
                Dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
                Paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
                Pastel2: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
                Pastel1: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2']
            }; // add lowercase aliases for case-insensitive matches

            for (var i$1 = 0, list$1 = Object.keys(colorbrewer); i$1 < list$1.length; i$1 += 1) {
                var key = list$1[i$1];
                colorbrewer[key.toLowerCase()] = colorbrewer[key];
            }

            var colorbrewer_1 = colorbrewer; // feel free to comment out anything to rollup
            // a smaller chroma.js built
            // io --> convert colors
            // operators --> modify existing Colors
            // interpolators
            // generators -- > create new colors

            chroma_1.average = average;
            chroma_1.bezier = bezier_1;
            chroma_1.blend = blend_1;
            chroma_1.cubehelix = cubehelix;
            chroma_1.mix = chroma_1.interpolate = mix;
            chroma_1.random = random_1;
            chroma_1.scale = scale; // other utility methods

            chroma_1.analyze = analyze_1.analyze;
            chroma_1.contrast = contrast;
            chroma_1.deltaE = deltaE;
            chroma_1.distance = distance;
            chroma_1.limits = analyze_1.limits;
            chroma_1.valid = valid; // scale

            chroma_1.scales = scales; // colors

            chroma_1.colors = w3cx11_1;
            chroma_1.brewer = colorbrewer_1;
            var chroma_js = chroma_1;
            return chroma_js;
        });
    });

    /*
     * colorbrewer.js
     *
     * Colorbrewer colors, by Cindy Brewer
     */
    var colorbrewer = {
        YlGn: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'],
        YlGnBu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'],
        GnBu: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'],
        BuGn: ['#f7fcfd', '#e5f5f9', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#006d2c', '#00441b'],
        PuBuGn: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636'],
        PuBu: ['#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#045a8d', '#023858'],
        BuPu: ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#810f7c', '#4d004b'],
        RdPu: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177', '#49006a'],
        PuRd: ['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#980043', '#67001f'],
        OrRd: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#b30000', '#7f0000'],
        YlOrRd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
        YlOrBr: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#993404', '#662506'],
        Purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
        Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
        Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
        Oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
        Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
        Greys: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'],
        PuOr: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'],
        BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
        PRGn: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837', '#00441b'],
        PiYG: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419'],
        RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
        RdGy: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#ffffff', '#e0e0e0', '#bababa', '#878787', '#4d4d4d', '#1a1a1a'],
        RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
        Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
        RdYlGn: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837']
    };

    function _defineProperty(obj, key, value) {
        if (key in obj) {
            Object.defineProperty(obj, key, {
                value: value,
                enumerable: true,
                configurable: true,
                writable: true
            });
        } else {
            obj[key] = value;
        }

        return obj;
    }

    var createCanvas = function (width, height) {
        return Object.assign(document.createElement('canvas'), {
            width: width,
            height: height
        });
    };

    function getScalingRatio (ctx) {
        // adapted from https://gist.github.com/callumlocke/cc258a193839691f60dd
        const backingStoreRatio = ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1;
        const devicePixelRatio = typeof window !== 'undefined' && window.devicePixelRatio || 1;
        const drawRatio = devicePixelRatio / backingStoreRatio;
        return drawRatio;
    }

    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    const doc = isBrowser && document; // utility for building up SVG node trees with the DOM API

    const sDOM = (tagName, attrs = {}, children, existingRoot) => {
        const elem = existingRoot || doc.createElementNS('http://www.w3.org/2000/svg', tagName);
        Object.keys(attrs).forEach(k => attrs[k] !== undefined && elem.setAttribute(k, attrs[k]));
        children && children.forEach(c => elem.appendChild(c));
        return elem;
    }; // serialize attrs object to XML attributes. Assumes everything is already
    // escaped (safe input).


    const serializeAttrs = attrs => Object.entries(attrs).filter(([_, v]) => v !== undefined).map(([k, v]) => `${k}='${v}'`).join(' '); // minimal XML-tree builder for use in Node


    const sNode = (tagName, attrs = {}, children) => ({
        tagName,
        attrs,
        children,
        toString: () => `<${tagName} ${serializeAttrs(attrs)}>${children ? children.join('') : ''}</${tagName}>`
    });

    class Pattern {
        constructor(_points, _polys, _opts) {
            _defineProperty(this, "_toSVG", (serializer, destSVG, _svgOpts = {}) => {
                const s = serializer;
                const defaultSVGOptions = {
                    includeNamespace: true,
                    coordinateDecimals: 1
                };
                const svgOpts = { ...defaultSVGOptions,
                    ..._svgOpts
                };
                const {
                    points,
                    opts,
                    polys
                } = this;
                const {
                    width,
                    height
                } = opts; // only round points if the coordinateDecimals option is non-negative
                // set coordinateDecimals to -1 to disable point rounding

                const roundedPoints = svgOpts.coordinateDecimals < 0 ? points : points.map(p => p.map(x => +x.toFixed(svgOpts.coordinateDecimals)));
                const paths = polys.map(poly => {
                    const xys = poly.vertexIndices.map(i => `${roundedPoints[i][0]},${roundedPoints[i][1]}`);
                    const d = 'M' + xys.join('L') + 'Z';
                    const hasStroke = opts.strokeWidth > 0; // shape-rendering crispEdges resolves the antialiasing issues, at the
                    // potential cost of some visual degradation. For the best performance
                    // *and* best visual rendering, use Canvas.

                    return s('path', {
                        d,
                        fill: opts.fill ? poly.color.css() : undefined,
                        stroke: hasStroke ? poly.color.css() : undefined,
                        'stroke-width': hasStroke ? opts.strokeWidth : undefined,
                        'stroke-linejoin': hasStroke ? 'round' : undefined,
                        'shape-rendering': opts.fill ? 'crispEdges' : undefined
                    });
                });
                const svg = s('svg', {
                    xmlns: svgOpts.includeNamespace ? 'http://www.w3.org/2000/svg' : undefined,
                    width,
                    height
                }, paths, destSVG);
                return svg;
            });

            _defineProperty(this, "toSVGTree", svgOpts => this._toSVG(sNode, null, svgOpts));

            _defineProperty(this, "toSVG", isBrowser ? (destSVG, svgOpts) => this._toSVG(sDOM, destSVG, svgOpts) : (destSVG, svgOpts) => this.toSVGTree(svgOpts));

            _defineProperty(this, "toCanvas", (destCanvas, _canvasOpts = {}) => {
                const defaultCanvasOptions = {
                    scaling: isBrowser ? 'auto' : false,
                    applyCssScaling: !!isBrowser
                };
                const canvasOpts = { ...defaultCanvasOptions,
                    ..._canvasOpts
                };
                const {
                    points,
                    polys,
                    opts
                } = this;
                const canvas = destCanvas || createCanvas(opts.width, opts.height); // doc.createElement('canvas')

                const ctx = canvas.getContext('2d');

                if (canvasOpts.scaling) {
                    const drawRatio = canvasOpts.scaling === 'auto' ? getScalingRatio(ctx) : canvasOpts.scaling;

                    if (drawRatio !== 1) {
                        // set the 'real' canvas size to the higher width/height
                        canvas.width = opts.width * drawRatio;
                        canvas.height = opts.height * drawRatio;

                        if (canvasOpts.applyCssScaling) {
                            // ...then scale it back down with CSS
                            canvas.style.width = opts.width + 'px';
                            canvas.style.height = opts.height + 'px';
                        }
                    } else {
                        // this is a normal 1:1 device: don't apply scaling
                        canvas.width = opts.width;
                        canvas.height = opts.height;

                        if (canvasOpts.applyCssScaling) {
                            canvas.style.width = '';
                            canvas.style.height = '';
                        }
                    }

                    ctx.scale(drawRatio, drawRatio);
                }

                const drawPoly = (poly, fill, stroke) => {
                    const vertexIndices = poly.vertexIndices;
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(points[vertexIndices[0]][0], points[vertexIndices[0]][1]);
                    ctx.lineTo(points[vertexIndices[1]][0], points[vertexIndices[1]][1]);
                    ctx.lineTo(points[vertexIndices[2]][0], points[vertexIndices[2]][1]);
                    ctx.closePath();

                    if (fill) {
                        ctx.fillStyle = fill.color.css();
                        ctx.fill();
                    }

                    if (stroke) {
                        ctx.strokeStyle = stroke.color.css();
                        ctx.lineWidth = stroke.width;
                        ctx.stroke();
                    }
                };

                if (opts.fill && opts.strokeWidth < 1) {
                    // draw background strokes at edge bounds to solve for white gaps due to
                    // canvas antialiasing. See https://stackoverflow.com/q/19319963/381299
                    polys.forEach(poly => drawPoly(poly, null, {
                        color: poly.color,
                        width: 2
                    }));
                } // draw visible fills and strokes


                polys.forEach(poly => drawPoly(poly, opts.fill && {
                    color: poly.color
                }, opts.strokeWidth > 0 && {
                    color: poly.color,
                    width: opts.strokeWidth
                }));
                return canvas;
            });

            this.points = _points;
            this.polys = _polys;
            this.opts = _opts;
        }

    }

    // Fast seeded RNG adapted from the public-domain implementation
    // by @byrc: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
    //
    // Usage:
    // const randFn = mulberry32('string seed')
    // const randomNumber = randFn() // [0, 1] random float
    function mulberry32(seed) {
        if (!seed) {
            seed = Math.random().toString(36);
        } // support no-seed usage


        var a = xmur3(seed)();
        return function () {
            a |= 0;
            a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function xmur3(str) {
        for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = h << 13 | h >>> 19;
        }

        return function () {
            h = Math.imul(h ^ h >>> 16, 2246822507);
            h = Math.imul(h ^ h >>> 13, 3266489909);
            return (h ^= h >>> 16) >>> 0;
        };
    }

    // Given an array of coordinates representing a triangle, find the centroid
    // of the triangle and return it as an {x, y} object
    // Accepts a single [[x, y], [x, y], [x, y]] argument
    const getCentroid = d => {
        return {
            x: (d[0][0] + d[1][0] + d[2][0]) / 3,
            y: (d[0][1] + d[1][1] + d[2][1]) / 3
        };
    };

    //
    // Usage example:
    //
    // const pattern = trianglify({
    //  width: 300,
    //  height: 200,
    //  colorFunction: trianglify.colorFunctions.sparkle(0.2)
    // })
    //
    // the snippet above gives you a trianglify pattern with a 20% random
    // jitter applied to the x and y gradient scales
    // Linear interpolation of two gradients, one for the x and one for the y
    // axis. This is the default Trianglify color function.
    // The bias parameter controls how prevalent the y axis is versus the x axis

    const interpolateLinear = (bias = 0.5) => ({
                                                   xPercent,
                                                   yPercent,
                                                   xScale,
                                                   yScale,
                                                   opts
                                               }) => chroma.mix(xScale(xPercent), yScale(yPercent), bias, opts.colorSpace); // Give the pattern a 'sparkle' effect by introducing random noise into the
    // x and y gradients, making for higher contrast between cells.

    const sparkle = (jitterFactor = 0.15) => ({
                                                  xPercent,
                                                  yPercent,
                                                  xScale,
                                                  yScale,
                                                  opts,
                                                  random
                                              }) => {
        const jitter = () => (random() - 0.5) * jitterFactor;

        const a = xScale(xPercent + jitter());
        const b = yScale(yPercent + jitter());
        return chroma.mix(a, b, 0.5, opts.colorSpace);
    }; // This is similar to the sparkle effect, but instead of swapping colors around
    // it darkens cells by a random amount. The shadowIntensity parameter controls
    // how dark the darkest shadows are.

    const shadows = (shadowIntensity = 0.8) => {
        return ({
                    xPercent,
                    yPercent,
                    xScale,
                    yScale,
                    opts,
                    random
                }) => {
            const a = xScale(xPercent);
            const b = yScale(yPercent);
            const color = chroma.mix(a, b, 0.5, opts.colorSpace);

            return color.darken(shadowIntensity * random());
        };
    };

    var colorFunctions = /*#__PURE__*/Object.freeze({
        __proto__: null,
        interpolateLinear: interpolateLinear,
        sparkle: sparkle,
        shadows: shadows
    });

    /*
     * Trianglify.js
     * by @qrohlf
     *
     * Licensed under the GPLv3
     */
    const defaultOptions = {
        width: 600,
        height: 400,
        cellSize: 75,
        variance: 0.75,
        seed: null,
        xColors: 'random',
        yColors: 'match',
        palette: colorbrewer,
        colorSpace: 'lab',
        colorFunction: interpolateLinear(0.5),
        fill: true,
        strokeWidth: 0,
        points: null
    }; // This function does the "core" render-independent work:
    //
    // 1. Parse and munge options
    // 2. Setup cell geometry
    // 3. Generate random points within cell geometry
    // 4. Use the Delaunator library to run the triangulation
    // 5. Do color interpolation to establish the fundamental coloring of the shapes

    function trianglify(_opts = {}) {
        Object.keys(_opts).forEach(k => {
            if (defaultOptions[k] === undefined) {
                throw TypeError(`Unrecognized option: ${k}`);
            }
        });
        const opts = { ...defaultOptions,
            ..._opts
        };

        if (!(opts.height > 0)) {
            throw TypeError(`invalid height: ${opts.height}`);
        }

        if (!(opts.width > 0)) {
            throw TypeError(`invalid width: ${opts.width}`);
        } // standard randomizer, used for point gen and layout


        const rand = mulberry32(opts.seed);

        const randomFromPalette = () => {
            if (opts.palette instanceof Array) {
                return opts.palette[Math.floor(rand() * opts.palette.length)];
            }

            const keys = Object.keys(opts.palette);
            return opts.palette[keys[Math.floor(rand() * keys.length)]];
        }; // The first step here is to set up our color scales for the X and Y axis.
        // First, munge the shortcut options like 'random' or 'match' into real color
        // arrays. Then, set up a Chroma scale in the appropriate color space.


        const processColorOpts = colorOpt => {
            switch (true) {
                case Array.isArray(colorOpt):
                    return colorOpt;

                case !!opts.palette[colorOpt]:
                    return opts.palette[colorOpt];

                case colorOpt === 'random':
                    return randomFromPalette();

                default:
                    throw TypeError(`Unrecognized color option: ${colorOpt}`);
            }
        };

        const xColors = processColorOpts(opts.xColors);
        const yColors = opts.yColors === 'match' ? xColors : processColorOpts(opts.yColors);
        const xScale = chroma.scale(xColors).mode(opts.colorSpace);
        const yScale = chroma.scale(yColors).mode(opts.colorSpace); // Our next step is to generate a pseudo-random grid of {x, y} points,
        // (or to simply utilize the points that were passed to us)

        const points = opts.points || getPoints(opts, rand); // Once we have the points array, run the triangulation

        var geomIndices = Delaunator.from(points).triangles; // ...and then generate geometry and color data:
        // use a different (salted) randomizer for the color function so that
        // swapping out color functions doesn't change the pattern geometry itself

        const salt = 42;
        const cRand = mulberry32(opts.seed ? opts.seed + salt : null);
        const polys = [];

        for (let i = 0; i < geomIndices.length; i += 3) {
            // convert shallow array-packed vertex indices into 3-tuples
            const vertexIndices = [geomIndices[i], geomIndices[i + 1], geomIndices[i + 2]]; // grab a copy of the actual vertices to use for calculations

            const vertices = vertexIndices.map(i => points[i]);
            const {
                width,
                height
            } = opts;

            const norm = num => Math.max(0, Math.min(1, num));

            const centroid = getCentroid(vertices);
            const xPercent = norm(centroid.x / width);
            const yPercent = norm(centroid.y / height);
            const color = opts.colorFunction({
                centroid,
                // centroid of polygon, non-normalized
                xPercent,
                // x-coordinate of centroid, normalized to [0, 1]
                yPercent,
                // y-coordinate of centroid, normalized to [0, 1]
                vertexIndices,
                // vertex indices of the polygon
                vertices,
                // [x, y] vertices of the polygon
                xScale,
                // x-colors scale for the pattern
                yScale,
                // y-colors scale for the pattern
                points,
                // array of generated points for the pattern
                opts,
                // options used to initialize the pattern
                random: cRand // seeded randomization function for use by color functions

            });
            polys.push({
                vertexIndices,
                centroid,
                color // chroma color object

            });
        }

        return new Pattern(points, polys, opts);
    }

    const getPoints = (opts, random) => {
        const {
            width,
            height,
            cellSize,
            variance
        } = opts; // pad by 2 cells outside the visible area on each side to ensure we fully
        // cover the 'artboard'

        const colCount = Math.floor(width / cellSize) + 4;
        const rowCount = Math.floor(height / cellSize) + 4; // determine bleed values to ensure that the grid is centered within the
        // artboard

        const bleedX = (colCount * cellSize - width) / 2;
        const bleedY = (rowCount * cellSize - height) / 2; // apply variance to cellSize to get cellJitter in pixels

        const cellJitter = cellSize * variance;

        const getJitter = () => (random() - 0.5) * cellJitter;

        const pointCount = colCount * rowCount;
        const halfCell = cellSize / 2;
        const points = Array(pointCount).fill(null).map((_, i) => {
            const col = i % colCount;
            const row = Math.floor(i / colCount); // [x, y, z]

            return [-bleedX + col * cellSize + halfCell + getJitter(), -bleedY + row * cellSize + halfCell + getJitter()];
        });
        return points;
    }; // tweak some of the exports here


    trianglify.utils = {
        mix: chroma.mix,
        colorbrewer
    };
    trianglify.colorFunctions = colorFunctions;
    trianglify.Pattern = Pattern;
    trianglify.defaultOptions = defaultOptions;

    return trianglify;

})));