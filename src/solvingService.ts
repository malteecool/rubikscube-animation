/*
  Cube.js
  - 3x3x3 cube with coordinates:
      x: 0..2 left->right (+x is right)
      y: 0..2 down->up   (+y is up)
      z: 0..2 back->front(+z is front)
    origin [0,0,0] is bottom-left-back.

  - Each cubie is an object that may contain face colors:
    { U: <color|null>, D: <color|null>, L: ..., R: ..., F: ..., B: ... }
    Non-face properties are preserved (so your existing structure is ok).

  - Moves: R, R', R2, L, L', L2, U, U', U2, D, D', D2, F, F', F2, B, B', B2
    Each move is applied as a layer rotation. The sticker remapping is computed
    with a geometric rotation of face normals (keeps it correct and maintainable).
*/

interface Cubie {
    U: string | null;
    D: string | null;
    L: string | null;
    R: string | null;
    F: string | null;
    B: string | null;
    [key: string]: any;
}

type CubeState = Cubie[][][];
type Axis = 'x' | 'y' | 'z';
type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
type MoveNotation = string;
type Coordinate = [number, number, number];

interface QueueNode {
    cube: SolvingService;
    seq: MoveNotation[];
    last: MoveNotation | null;
}

interface IJCoord {
    i: number;
    j: number;
    coord: Coordinate;
}

class SolvingService {

    cube: CubeState;
    moves: MoveNotation[];

    constructor(state3D: CubeState | null = null) {
        // Initialize with provided state or a solved cube
        if (state3D) {
            // assume it's a 3x3x3 nested array matching App.tsx buildCubeState format
            this.cube = deepCopyCube(state3D);
        } else {
            this.cube = SolvingService.solvedState();
        }
        this.moves = []; // recorded moves
    }

    // Create a canonical solved cube with the given face colors
    // If no face colors provided, extracts them from a given cube state (reading centers)
    // Falls back to standard Rubik's colors (U: white, D: yellow, L: orange, R: red, F: green, B: blue)
    static solvedState(faceColors?: { [key: string]: string } | null, referenceState?: CubeState): CubeState {
        let faces: { [key: string]: string };

        if (faceColors) {
            // Use provided colors
            faces = faceColors;
        } else if (referenceState) {
            // Extract colors from center stickers of reference cube state
            faces = {
                U: referenceState[1][2][1].U || 'W',
                D: referenceState[1][0][1].D || 'Y',
                L: referenceState[0][1][1].L || 'O',
                R: referenceState[2][1][1].R || 'R',
                F: referenceState[1][1][2].F || 'G',
                B: referenceState[1][1][0].B || 'B'
            };
        } else {
            // Use standard Rubik's cube colors
            faces = { U: 'W', D: 'Y', L: 'O', R: 'R', F: 'G', B: 'B' };
        }

        const arr: CubeState = [];
        for (let x = 0; x < 3; x++) {
            arr[x] = [];
            for (let y = 0; y < 3; y++) {
                arr[x][y] = [];
                for (let z = 0; z < 3; z++) {
                    // every cubie stores faces present at that location
                    const c: Cubie = { U: null, D: null, L: null, R: null, F: null, B: null };
                    if (y === 2) c.U = faces.U || null;
                    if (y === 0) c.D = faces.D || null;
                    if (x === 0) c.L = faces.L || null;
                    if (x === 2) c.R = faces.R || null;
                    if (z === 2) c.F = faces.F || null;
                    if (z === 0) c.B = faces.B || null;
                    arr[x][y][z] = c;
                }
            }
        }
        return arr;
    }

    // Apply a single move notation and record it
    applyMove(notation: MoveNotation): void {
        const moveMap: { [key: string]: () => void } = {
            "R": () => this.rotateLayer('x', 2, 1),
            "R'": () => this.rotateLayer('x', 2, -1),
            "R2": () => { this.rotateLayer('x', 2, 1); this.rotateLayer('x', 2, 1); },

            "L": () => this.rotateLayer('x', 0, -1), // L clockwise when looking from -x is opposite sign
            "L'": () => this.rotateLayer('x', 0, 1),
            "L2": () => { this.rotateLayer('x', 0, 1); this.rotateLayer('x', 0, 1); },

            "U": () => this.rotateLayer('y', 2, 1),
            "U'": () => this.rotateLayer('y', 2, -1),
            "U2": () => { this.rotateLayer('y', 2, 1); this.rotateLayer('y', 2, 1); },

            "D": () => this.rotateLayer('y', 0, -1),
            "D'": () => this.rotateLayer('y', 0, 1),
            "D2": () => { this.rotateLayer('y', 0, 1); this.rotateLayer('y', 0, 1); },

            "F": () => this.rotateLayer('z', 2, 1),
            "F'": () => this.rotateLayer('z', 2, -1),
            "F2": () => { this.rotateLayer('z', 2, 1); this.rotateLayer('z', 2, 1); },

            "B": () => this.rotateLayer('z', 0, -1),
            "B'": () => this.rotateLayer('z', 0, 1),
            "B2": () => { this.rotateLayer('z', 0, 1); this.rotateLayer('z', 0, 1); }
        };

        if (!(notation in moveMap)) throw new Error("Unknown move: " + notation);
        moveMap[notation]();
        this.moves.push(notation);
    }

    applyMoves(seq: MoveNotation[] | string): void {
        // seq: array or string with space separated moves
        if (typeof seq === 'string') seq = seq.trim().split(/\s+/);
        for (const m of seq) this.applyMove(m);
    }

    // rotateLayer(axis, index, dir)
    // axis: 'x' | 'y' | 'z'
    // index: 0 | 1 | 2 (which layer on that axis)
    // dir: +1 => 90° clockwise when looking from positive axis toward the layer;
    //      -1 => 90° counterclockwise (i.e. "prime")
    rotateLayer(axis: Axis, index: number, dir: number = 1): void {
        // copy old cubies
        const old = deepCopyCube(this.cube);

        // helper to map coordinate -> 2D grid coords (i,j) on the face for rotation
        const mapToIJ = (x: number, y: number, z: number): IJCoord => {
            if (axis === 'x') return { i: 2 - z, j: y, coord: [x, y, z] }; // i across -z->+z, j up y
            if (axis === 'y') return { i: x, j: 2 - z, coord: [x, y, z] }; // i across +x, j up -z->+z
            return { i: x, j: y, coord: [x, y, z] }; // axis z: i across +x, j up +y
        };

        // produce a 3x3 grid of coordinates that are in the selected layer
        const layerCoords: Coordinate[] = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    if ((axis === 'x' && x === index) ||
                        (axis === 'y' && y === index) ||
                        (axis === 'z' && z === index)) {
                        layerCoords.push([x, y, z]);
                    }
                }
            }
        }

        // Build index map from (i,j) -> coordinate
        const grid: (Coordinate | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
        for (const [x, y, z] of layerCoords) {
            const { i, j } = mapToIJ(x, y, z);
            grid[j][i] = [x, y, z];
        }

        // rotate positions: newGrid[r][c] = oldGrid[...]
        const newGrid: (Coordinate | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                // rotation: clockwise (dir=1) maps old (2-c, r) -> new (r,c)
                // if dir=-1 (ccw), old (c, 2-r) -> new (r,c)
                let oldR: number, oldC: number;
                if (dir === 1) { oldR = 2 - c; oldC = r; }
                else { oldR = c; oldC = 2 - r; }
                newGrid[r][c] = grid[oldR][oldC];
            }
        }

        // Now place cubies from old positions into new positions, and rotate their sticker keys
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const oldCoord = grid[r][c] as Coordinate; // position we're pulling FROM (original before rotation)
                const newCoord = newGrid[r][c] as Coordinate; // position we're placing TO (new position after rotation)
                const [nx, ny, nz] = newCoord;
                const [ox, oy, oz] = oldCoord;

                // copy old cubie (deep copy to avoid aliasing)
                const fromCubie = deepCopyCubie(old[ox][oy][oz]);

                // rotate the sticker-face keys on the cubie according to the geometric rotation
                const faceMap = rotationFaceMap(axis, dir); // mapping oldFace -> newFace after rotation of +90*dir degrees
                const newCubie: Cubie = { U: null, D: null, L: null, R: null, F: null, B: null };

                // For each possible face on fromCubie, find where that face points after rotation
                for (const faceKey of ['U', 'D', 'L', 'R', 'F', 'B'] as Face[]) {
                    const color = fromCubie[faceKey];
                    if (color == null) continue;
                    const mapped = faceMap[faceKey as Face];
                    newCubie[mapped] = color;
                }

                // Preserve non-face properties if present (copy them)
                for (const k of Object.keys(fromCubie)) {
                    if (!['U', 'D', 'L', 'R', 'F', 'B'].includes(k)) newCubie[k] = deepCopy(fromCubie[k]);
                }

                // write into live cube
                this.cube[nx][ny][nz] = newCubie;
            }
        }
    }

    // Convenience wrappers for moves
    R(): void { this.applyMove("R"); }
    Rp(): void { this.applyMove("R'"); }
    R2(): void { this.applyMove("R2"); }
    L(): void { this.applyMove("L"); }
    Lp(): void { this.applyMove("L'"); }
    L2(): void { this.applyMove("L2"); }
    U(): void { this.applyMove("U"); }
    Up(): void { this.applyMove("U'"); }
    U2(): void { this.applyMove("U2"); }
    D(): void { this.applyMove("D"); }
    Dp(): void { this.applyMove("D'"); }
    D2(): void { this.applyMove("D2"); }
    F(): void { this.applyMove("F"); }
    Fp(): void { this.applyMove("F'"); }
    F2(): void { this.applyMove("F2"); }
    B(): void { this.applyMove("B"); }
    Bp(): void { this.applyMove("B'"); }
    B2(): void { this.applyMove("B2"); }

    // Return whether the cube is solved. We check ALL six faces for uniform color.
    // Each face should have all stickers the same color (which color doesn't matter, just uniform).
    isSolved(): boolean {
        const faceChecks: { [key in Face]: (x: number, y: number, z: number) => boolean } = {
            U: (_x, y, _z) => y === 2,
            D: (_x, y, _z) => y === 0,
            L: (x, _y, _z) => x === 0,
            R: (x, _y, _z) => x === 2,
            F: (_x, _y, z) => z === 2,
            B: (_x, _y, z) => z === 0
        };

        // Check each face for uniform color
        for (const face of Object.keys(faceChecks) as Face[]) {
            let expectedColor: string | null = null;
            for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
                if (!faceChecks[face](x, y, z)) continue;
                const c = this.cube[x][y][z][face];
                // Skip null stickers (interior faces have null)
                if (c === null) continue;
                if (expectedColor === null) expectedColor = c;
                else if (c !== expectedColor) return false;
            }
        }

        return true;
    }

    // Simple "scramble": apply N random moves
    scramble(n: number = 25): void {
        const moves = ["R", "R'", "R2", "L", "L'", "L2", "U", "U'", "U2", "D", "D'", "D2", "F", "F'", "F2", "B", "B'", "B2"];
        for (let i = 0; i < n; i++) {
            const m = moves[Math.floor(Math.random() * moves.length)];
            this.applyMove(m);
        }
    }

    // ---------------------
    // Simple (starter) solver:
    // A greedy routine that tries to place the top (U) face by placing each target
    // sticker using a depth-limited BFS that searches for a short sequence that
    // moves the desired sticker into the desired position.
    // This is intentionally small and maintainable — it's a framework to extend.
    // ---------------------
    solveGreedyTop(maxDepthForPiece: number = 6): MoveNotation[] {
        // Solve the U face (y=2) so that the U stickers are correct color on U face
        // We'll treat the target color for U as the color currently at the cube's solved state top center

        const targetColor = this.cube[1][2][1].U; // current center U color
        //const targetColor = this.cube[0][1][1].L;
        const solvedPositions: Coordinate[] = [];
        const positionsToSolve: Coordinate[] = [];
        for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
            positionsToSolve.push([x, 2, z]);
        }
        // Solve each position one by one (ignoring interactions)
        for (const [tx, ty, tz] of positionsToSolve) {
            const cur = this.cube[tx][ty][tz];
            if (cur.U === targetColor) {
                solvedPositions.push([tx, ty, tz]);
                continue;
            }
            // Find any cubie in the cube that has the face color == targetColor on any face
            const candidates: Array<{ pos: Coordinate; face: Face }> = [];
            for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
                const cd = this.cube[x][y][z];
                for (const faceKey of ['U', 'D', 'L', 'R', 'F', 'B'] as Face[]) {
                    if (cd[faceKey] === targetColor) candidates.push({ pos: [x, y, z], face: faceKey });
                }
            }
            // try each candidate and run a depth-limited BFS searching for a short move sequence
            let placed = false;
            for (const cand of candidates) {
                const seq = this._findMovesBringingFaceAtPosToTarget(cand.pos, cand.face, [tx, ty, tz], maxDepthForPiece);
                if (seq) {
                    this.applyMoves(seq);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                // Couldn't find short sequence for this piece; continue to next (partial progress)
                // A more robust solver would try different heuristics or deeper search.
            }
        }
        return this.moves.slice(); // return the move log
    }

    // depth-limited BFS (or iterative deepening) to find a small sequence that moves the cubie that
    // currently has a color on face `faceKey` at position `pos` to be located at targetPos and have that face
    // sitting on the target face (i.e., the sticker ends up on the target's corresponding face).
    //
    // This is intentionally simple: it tries short sequences from the allowed move set and simulates them.
    private _findMovesBringingFaceAtPosToTarget(startPos: Coordinate, startFace: Face, targetPos: Coordinate, maxDepth: number = 6): MoveNotation[] | null {
        const moves: MoveNotation[] = ["R", "R'", "R2", "L", "L'", "L2", "U", "U'", "U2", "D", "D'", "D2", "F", "F'", "F2", "B", "B'", "B2"];

        // Get the target color to match
        const targetColor = this.cube[startPos[0]][startPos[1]][startPos[2]][startFace];

        // Determine which face of targetPos should match the target color
        // based on the position's constraints (e.g., if y===2, it should be on U face)
        const [tx, ty, tz] = targetPos;
        let targetFaceAtPos: Face = 'U'; // fallback

        // Determine target face based on position
        if (ty === 2) targetFaceAtPos = 'U';      // top layer → U face
        else if (ty === 0) targetFaceAtPos = 'D'; // bottom layer → D face
        else if (ty === 1) {
            // Middle layer - need to infer from other constraints
            if (tx === 0) targetFaceAtPos = 'L';
            else if (tx === 2) targetFaceAtPos = 'R';
            else if (tz === 0) targetFaceAtPos = 'B';
            else if (tz === 2) targetFaceAtPos = 'F';
        }
        console.log(`Target face at pos ${targetPos} is ${targetFaceAtPos}`);
        console.log(`Target color is ${targetColor}`);
        const isGoal = (cube: SolvingService): boolean => {
            // after moves applied, we want the cubie at targetPos to have the targetColor on the correct face
            return cube.cube[tx][ty][tz][targetFaceAtPos] === targetColor;
        };

        const startCube = new SolvingService(this.cube);
        // quick check: if already satisfied
        if (isGoal(startCube)) return [];

        const visited = new Set<string>();
        const stateKey = (cube: SolvingService): string => {
            // small fingerprint: stringify face stickers only
            const arr: string[] = [];
            for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
                const it = cube.cube[x][y][z];
                arr.push([it.U, it.D, it.L, it.R, it.F, it.B].map(v => v || '.').join(''));
            }
            return arr.join('|');
        };

        const q: QueueNode[] = [{ cube: startCube, seq: [], last: null }];
        visited.add(stateKey(startCube));
        while (q.length) {
            const node = q.shift();

            if (!node) {
                break;
            }

            if (node.seq.length >= maxDepth) {
                continue;
            }

            for (const m of moves) {
                // simple pruning: avoid applying a move directly inverse of last (like R then R')
                if (node.last && inverse(node.last) === m) continue;
                const ncube = new SolvingService(node.cube.cube);
                ncube.applyMove(m);
                const key = stateKey(ncube);
                if (visited.has(key)) continue;
                visited.add(key);
                const newSeq = node.seq.concat([m]);
                if (isGoal(ncube)) return newSeq;
                q.push({ cube: ncube, seq: newSeq, last: m });
            }
        }
        return null; // not found within depth
    }

    // debug: pretty-print the U face as a 3x3 grid of colors
    faceGrid(face: Face): (string | null)[][] {
        const grid: (string | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
        for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
            const cond = {
                U: y === 2, D: y === 0, L: x === 0, R: x === 2, F: z === 2, B: z === 0
            }[face];
            if (!cond) continue;
            // map (x,y,z) to grid coords for readability
            let r: number, c: number;
            if (face === 'U') { r = 2 - z; c = x; } // rows 0..2 top->bottom
            else if (face === 'F') { r = 2 - y; c = x; }
            else if (face === 'R') { r = 2 - y; c = 2 - z; }
            else if (face === 'D') { r = z; c = x; }
            else if (face === 'L') { r = 2 - y; c = z; }
            else if (face === 'B') { r = 2 - y; c = 2 - x; }
            else return grid; // unreachable but needed for TS
            grid[r][c] = this.cube[x][y][z][face] || '.';
        }
        return grid;
    }
}


// ----------------- Helper utilities -----------------

function deepCopy(x: any): any { return JSON.parse(JSON.stringify(x)); }

function deepCopyCubie(c: Cubie): Cubie {
    // c might be null-ish; preserve unknown props too
    return deepCopy(c);
}

function deepCopyCube(state: CubeState): CubeState {
    return deepCopy(state);
}

// Face normal vectors
const NORMALS: { [key in Face]: number[] } = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    L: [-1, 0, 0],
    R: [1, 0, 0],
    F: [0, 0, 1],
    B: [0, 0, -1]
};

// rotationFaceMap(axis, dir) -> mapping oldFaceKey -> newFaceKey
// axis: 'x'|'y'|'z', dir: +1 or -1 (clockwise when looking from +axis)
function rotationFaceMap(axis: Axis, dir: number): { [key in Face]: Face } {
    // We build rotation matrix for angle = -dir * 90deg in math right-hand-rule terms.
    // Explanation: The user's "clockwise when looking from +axis" corresponds to
    // a rotation of angle = -90° (in right-hand convention). To allow dir +/- we
    // set angle = - dir * π/2.
    const angle = -dir * Math.PI / 2;
    const cos = Math.round(Math.cos(angle)); // 0 or +/-1
    const sin = Math.round(Math.sin(angle)); // 0 or +/-1

    // rotation matrix
    let R: number[][];
    if (axis === 'x') {
        R = [
            [1, 0, 0],
            [0, cos, -sin],
            [0, sin, cos]
        ];
    } else if (axis === 'y') {
        R = [
            [cos, 0, sin],
            [0, 1, 0],
            [-sin, 0, cos]
        ];
    } else { // z
        R = [
            [cos, -sin, 0],
            [sin, cos, 0],
            [0, 0, 1]
        ];
    }

    // For each face normal, rotate it and find which face it aligns with
    const mapping: { [key in Face]?: Face } = {};
    for (const [face, vec] of Object.entries(NORMALS) as [Face, number[]][]) {
        const v = multiplyMatVec(R, vec);
        // due to rounding we will get integer vector among {-1,0,1}
        const targetFace = faceFromNormal(v);
        if (!targetFace) throw new Error("Unknown mapping from " + face + " -> " + v);
        mapping[face] = targetFace;
    }
    return mapping as { [key in Face]: Face };
}

function multiplyMatVec(M: number[][], v: number[]): number[] {
    return [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
    ].map(n => Math.round(n));
}

function faceFromNormal(vec: number[]): Face | null {
    for (const [k, v] of Object.entries(NORMALS) as [Face, number[]][]) {
        if (v[0] === vec[0] && v[1] === vec[1] && v[2] === vec[2]) return k;
    }
    return null;
}

function inverse(move: MoveNotation): MoveNotation {
    if (move.endsWith("2")) return move;
    if (move.endsWith("'")) return move.slice(0, -1) as MoveNotation;
    return (move + "'") as MoveNotation;
}

// ----------------------------------------------------

export default SolvingService;