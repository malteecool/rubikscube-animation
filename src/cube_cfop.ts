/*
  cube_cfop.ts
  Extended Cube implementation including a CFOP solver (maintainable, not optimal).

  Usage:
    const cube = new Cube();
    cube.scramble(25);
    const moves = cube.solveCFOP();
    console.log(moves.join(' '));

  Notes:
  - This file builds upon a robust geometric move engine (rotation matrices)
    and adds CFOP stages:
      1) Cross (down face)
      2) F2L (intuitive pair insertion)
      3) OLL (2-look: edges then corners)
      4) PLL (2-look: permute corners then edges)
  - The solver favors readability and maintainability. Many steps use
    short algorithm tables and small BFS fallbacks for rarer cases.
*/

import { F2L } from "./cube_cfop_f2l";

// --- Begin core Cube engine (move engine and representation) ---

type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
type Axis = 'x' | 'y' | 'z';
type Coordinate = [number, number, number];

interface Cubie {
    U: string | null;
    D: string | null;
    L: string | null;
    R: string | null;
    F: string | null;
    B: string | null;
    [key: string]: string | null;
}

type CubeState = Cubie[][][];

interface StitcherResult {
    pos: Coordinate;
    face: Face;
}

interface QueueNode {
    cube: SolvingServiceV2;
    seq: string[];
    last: string | null;
}

interface RotationMatrix {
    [key: number]: number[];
}

interface FaceMap {
    [key: string]: string;
}

const NORMALS: Record<Face, number[]> = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    L: [-1, 0, 0],
    R: [1, 0, 0],
    F: [0, 0, 1],
    B: [0, 0, -1]
};

function deepCopy<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

function deepCopyCubie(c: Cubie): Cubie {
    return deepCopy(c);
}

function deepCopyCube(state: CubeState): CubeState {
    return deepCopy(state);
}

function multiplyMatVec(M: RotationMatrix, v: number[]): number[] {
    return [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
    ].map(n => Math.round(n));
}

function faceFromNormal(vec: number[]): Face | null {
    for (const [k, v] of Object.entries(NORMALS)) {
        if (v[0] === vec[0] && v[1] === vec[1] && v[2] === vec[2]) {
            return k as Face;
        }
    }
    return null;
}

function rotationFaceMap(axis: Axis, dir: number): FaceMap {
    const angle = -dir * Math.PI / 2;
    const cos = Math.round(Math.cos(angle));
    const sin = Math.round(Math.sin(angle));

    let R: RotationMatrix;
    if (axis === 'x') {
        R = [[1, 0, 0], [0, cos, -sin], [0, sin, cos]];
    } else if (axis === 'y') {
        R = [[cos, 0, sin], [0, 1, 0], [-sin, 0, cos]];
    } else {
        R = [[cos, -sin, 0], [sin, cos, 0], [0, 0, 1]];
    }

    const mapping: FaceMap = {};
    for (const [face, vec] of Object.entries(NORMALS)) {
        const v = multiplyMatVec(R, vec);
        const tf = faceFromNormal(v);
        if (!tf) throw new Error('Bad face map');
        mapping[face] = tf;
    }
    return mapping;
}

function inverse(move: string): string {
    if (move.endsWith('2')) return move;
    if (move.endsWith("'")) return move.slice(0, -1);
    return move + "'";
}

export class SolvingServiceV2 {
    cube: CubeState;
    moves: string[];

    constructor(state3D: CubeState | null = null) {
        if (state3D) {
            this.cube = deepCopyCube(state3D);
        } else {
            this.cube = SolvingServiceV2.solvedState();
        }
        this.moves = [];
    }
    static solvedState(): CubeState {
        const faces: Record<Face, string> = { U: 'W', D: 'Y', L: 'O', R: 'R', F: 'G', B: 'B' };
        const arr: CubeState = [];

        for (let x = 0; x < 3; x++) {
            arr[x] = [];
            for (let y = 0; y < 3; y++) {
                arr[x][y] = [];
                for (let z = 0; z < 3; z++) {
                    const c: Cubie = { U: null, D: null, L: null, R: null, F: null, B: null };
                    if (y === 2) c.U = faces.U;
                    if (y === 0) c.D = faces.D;
                    if (x === 0) c.L = faces.L;
                    if (x === 2) c.R = faces.R;
                    if (z === 2) c.F = faces.F;
                    if (z === 0) c.B = faces.B;
                    arr[x][y][z] = c;
                }
            }
        }
        return arr;
    }

    applyMove(notation: string): void {
        const moveMap: Record<string, () => void> = {
            'R': () => this.rotateLayer('x', 2, 1),
            "R'": () => this.rotateLayer('x', 2, -1),
            'R2': () => { this.rotateLayer('x', 2, 1); this.rotateLayer('x', 2, 1); },

            'L': () => this.rotateLayer('x', 0, -1),
            "L'": () => this.rotateLayer('x', 0, 1),
            'L2': () => { this.rotateLayer('x', 0, 1); this.rotateLayer('x', 0, 1); },

            'U': () => this.rotateLayer('y', 2, 1),
            "U'": () => this.rotateLayer('y', 2, -1),
            'U2': () => { this.rotateLayer('y', 2, 1); this.rotateLayer('y', 2, 1); },

            'D': () => this.rotateLayer('y', 0, -1),
            "D'": () => this.rotateLayer('y', 0, 1),
            'D2': () => { this.rotateLayer('y', 0, 1); this.rotateLayer('y', 0, 1); },

            'F': () => this.rotateLayer('z', 2, 1),
            "F'": () => this.rotateLayer('z', 2, -1),
            'F2': () => { this.rotateLayer('z', 2, 1); this.rotateLayer('z', 2, 1); },

            'B': () => this.rotateLayer('z', 0, -1),
            "B'": () => this.rotateLayer('z', 0, 1),
            'B2': () => { this.rotateLayer('z', 0, 1); this.rotateLayer('z', 0, 1); }
        };
        if (!(notation in moveMap)) throw new Error('Unknown move: ' + notation);
        moveMap[notation]();
        this.moves.push(notation);
    }

    applyMoves(seq: string | string[]): void {
        if (typeof seq === 'string') seq = seq.trim().split(/\s+/);
        for (const m of seq) this.applyMove(m);
    }

    rotateLayer(axis: Axis, index: number, dir: number = 1): void {
        const old = deepCopyCube(this.cube);
        const mapToIJ = (x: number, y: number, z: number): { i: number; j: number } => {
            if (axis === 'x') return { i: 2 - z, j: y };
            if (axis === 'y') return { i: x, j: 2 - z };
            return { i: x, j: y };
        };

        const layerCoords: Coordinate[] = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    if ((axis === 'x' && x === index) || (axis === 'y' && y === index) || (axis === 'z' && z === index)) {
                        layerCoords.push([x, y, z]);
                    }
                }
            }
        }

        const grid: (Coordinate | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
        for (const [x, y, z] of layerCoords) {
            const { i, j } = mapToIJ(x, y, z);
            grid[j][i] = [x, y, z];
        }

        const newGrid: (Coordinate | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                let oldR: number, oldC: number;
                if (dir === 1) {
                    oldR = 2 - c;
                    oldC = r;
                } else {
                    oldR = c;
                    oldC = 2 - r;
                }
                newGrid[r][c] = grid[oldR][oldC];
            }
        }

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const newCoord = grid[r][c];
                const oldCoord = newGrid[r][c];
                if (!newCoord || !oldCoord) continue;

                const [nx, ny, nz] = newCoord;
                const [ox, oy, oz] = oldCoord;
                const fromCubie = deepCopyCubie(old[ox][oy][oz]);
                const faceMap = rotationFaceMap(axis, dir);
                const newCubie: Cubie = { U: null, D: null, L: null, R: null, F: null, B: null };

                for (const faceKey of ['U', 'D', 'L', 'R', 'F', 'B'] as Face[]) {
                    const color = fromCubie[faceKey];
                    if (color == null) continue;
                    const mapped = faceMap[faceKey];
                    newCubie[mapped as Face] = color;
                }

                for (const k of Object.keys(fromCubie)) {
                    if (!['U', 'D', 'L', 'R', 'F', 'B'].includes(k)) {
                        (newCubie as any)[k] = deepCopy((fromCubie as any)[k]);
                    }
                }

                this.cube[nx][ny][nz] = newCubie;
            }
        }
    }

    // convenience wrappers
    R(): void { this.applyMove('R'); }
    Rp(): void { this.applyMove("R'"); }
    R2(): void { this.applyMove('R2'); }
    L(): void { this.applyMove('L'); }
    Lp(): void { this.applyMove("L'"); }
    L2(): void { this.applyMove('L2'); }
    U(): void { this.applyMove('U'); }
    Up(): void { this.applyMove("U'"); }
    U2(): void { this.applyMove('U2'); }
    D(): void { this.applyMove('D'); }
    Dp(): void { this.applyMove("D'"); }
    D2(): void { this.applyMove('D2'); }
    F(): void { this.applyMove('F'); }
    Fp(): void { this.applyMove("F'"); }
    F2(): void { this.applyMove('F2'); }
    B(): void { this.applyMove('B'); }
    Bp(): void { this.applyMove("B'"); }
    B2(): void { this.applyMove('B2'); }

    isSolved(): boolean {
        type FaceCheckFn = (_x: number, _y: number, _z: number) => boolean;
        const faceChecks: Record<Face, FaceCheckFn> = {
            U: (_x, _y, z) => _y === 2,
            D: (_x, _y, z) => _y === 0,
            L: (_x, _y, z) => _x === 0,
            R: (_x, _y, z) => _x === 2,
            F: (_x, _y, z) => z === 2,
            B: (_x, _y, z) => z === 0
        };

        for (const face of Object.keys(faceChecks) as Face[]) {
            let expected: string | null = null;
            for (let x = 0; x < 3; x++) {
                for (let y = 0; y < 3; y++) {
                    for (let z = 0; z < 3; z++) {
                        if (!faceChecks[face](x, y, z)) continue;
                        const c = this.cube[x][y][z][face];
                        if (expected === null) expected = c;
                        else if (c !== expected) return false;
                    }
                }
            }
        }
        return true;
    }

    scramble(n: number = 25): string[] {
        const moves = ['R', "R'", 'R2', 'L', "L'", 'L2', 'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2'];
        const randomizedMoves = [];
        for (let i = 0; i < n; i++) {
            const move = moves[Math.floor(Math.random() * moves.length)]
            this.applyMove(move);
            randomizedMoves.push(move);
        }
        return randomizedMoves;
    }

    faceGrid(face: Face): (string | null)[][] {
        const grid: (string | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    const cond: Record<Face, boolean> = {
                        U: y === 2,
                        D: y === 0,
                        L: x === 0,
                        R: x === 2,
                        F: z === 2,
                        B: z === 0
                    };
                    if (!cond[face]) continue;
                    let r: number, c: number;
                    if (face === 'U') {
                        r = 2 - z;
                        c = x;
                    } else if (face === 'F') {
                        r = 2 - y;
                        c = x;
                    } else if (face === 'R') {
                        r = 2 - y;
                        c = 2 - z;
                    } else if (face === 'D') {
                        r = z;
                        c = x;
                    } else if (face === 'L') {
                        r = 2 - y;
                        c = z;
                    } else {
                        // B
                        r = 2 - y;
                        c = 2 - x;
                    }
                    grid[r][c] = this.cube[x][y][z][face] || '.';
                }
            }
        }
        return grid;
    }

    // ---------------- CFOP stages ----------------

    // Top-level entry: runs full CFOP stages and returns the move list
    solveCFOP(): string[] {

        // clear past moves log and work on a copied solver so caller can inspect
        this.moves = [];
        // 1) Solve Down Cross (D face). We'll assume D center gives target color
        this.solveCrossDown();
        // 2) Solve F2L (intuitive insertion for each of the 4 slots)
        //this.solveF2LIntuitive();
        this.solveF2L();

        // 3) OLL (2-look)
        this.solveOLL2Look();
        // 4) PLL (2-look)
        this.solvePLL2Look();

        this.pruneInverseMoves();

        return this.moves.slice();
    }

    // Cross on D (y=0). Greedy approach placing each D-edge.
    solveCrossDown(): void {
        const target = this.cube[1][0][1].D; // D center color
        type EdgeTarget = [number, number, number, Face];
        const edgeTargets: EdgeTarget[] = [[1, 0, 0, 'B'], [2, 0, 1, 'R'], [1, 0, 2, 'F'], [0, 0, 1, 'L']];

        console.log(`Solving D cross for color ${target}`);

        for (const [tx, ty, tz, adjFace] of edgeTargets) {
            // Skip if already solved: D sticker is on bottom and adjacent face color matches
            if (this.cube[tx][ty][tz].D === target) {
                console.log(`D edge at (${tx},${ty},${tz}) already solved.`);
                // Also verify the adjacent face sticker is correct
                const expectedAdjacentColor = this.cube[1][1][1][adjFace]; // adjacent center color
                const adjacentSticker = this.cube[tx][ty][tz][adjFace];
                if (adjacentSticker === expectedAdjacentColor) continue;
            }

            // Find a D-colored sticker that's not yet in correct position
            const cand = this._findAnySticker(target!);
            console.log(`Placing D edge at (${tx},${ty},${tz}) using sticker at (${cand?.pos}) face ${cand?.face}`);
            if (!cand) continue;

            // Attempt to place it (with retries if first attempt fails)
            let maxAttempts = 3;
            while (maxAttempts > 0) {
                const seq = this._findSequenceToPlaceSticker(cand.pos, cand.face, [tx, ty, tz], 'D', 8);
                if (!seq) break;

                this.applyMoves(seq);

                // Verify it's actually solved now
                const expectedAdjacentColor = this.cube[1][1][1][adjFace];
                if (this.cube[tx][ty][tz].D === target && this.cube[tx][ty][tz][adjFace] === expectedAdjacentColor) {
                    break; // Successfully placed
                }

                maxAttempts--;
            }
        }
    }

    solveF2L() {
        const f2l = new F2L(this.cube);
        const f2lMoves: string[] = f2l.solveF2LAlg();
        this.applyMoves(f2lMoves);
    }

    _solveSingleF2LSlot(slot: Coordinate): void {
        // Check if slot is already solved
        const goalCornerColors = this._colorsForCorner(slot);
        const slotCubie = this.cube[slot[0]][slot[1]][slot[2]];
        const slotColors = [slotCubie.U, slotCubie.D, slotCubie.L, slotCubie.R, slotCubie.F, slotCubie.B].filter(Boolean) as string[];

        // If all colors match and piece is in right position, verify orientation
        if (slotColors.length === goalCornerColors.length && goalCornerColors.every(c => slotColors.includes(c))) {
            const solved = SolvingServiceV2.solvedState();
            const solvedSlot = solved[slot[0]][slot[1]][slot[2]];
            const orientationCorrect = ['U', 'D', 'L', 'R', 'F', 'B'].every(
                (face) => slotCubie[face as Face] === solvedSlot[face as Face]
            );
            if (orientationCorrect) return; // Already solved
        }

        // Find corner piece with matching colors
        let cornerPos: Coordinate | null = null;
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    // Skip if already in target slot (wrong orientation will be fixed)
                    if (x === slot[0] && y === slot[1] && z === slot[2]) continue;

                    const cub = this.cube[x][y][z];
                    const colors = [cub.U, cub.D, cub.L, cub.R, cub.F, cub.B].filter(Boolean) as string[];
                    // Match all colors for this corner
                    if (goalCornerColors.length === colors.length &&
                        goalCornerColors.every(c => colors.includes(c))) {
                        cornerPos = [x, y, z];
                    }
                }
            }
        }

        const edgeTargetPos = this._edgePositionBetweenCornerFaces(slot);
        let edgePos: Coordinate | null = null;
        const goalEdgeColors = this._colorsForEdge(edgeTargetPos);
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    // Skip if already in target position
                    if (x === edgeTargetPos[0] && y === edgeTargetPos[1] && z === edgeTargetPos[2]) continue;

                    const cub = this.cube[x][y][z];
                    const colors = [cub.U, cub.D, cub.L, cub.R, cub.F, cub.B].filter(Boolean) as string[];
                    if (goalEdgeColors.length === colors.length &&
                        goalEdgeColors.every(c => colors.includes(c))) {
                        edgePos = [x, y, z];
                    }
                }
            }
        }

        // Move both pieces to U layer
        if (cornerPos && cornerPos[1] !== 2) {
            const seq = this._findSequenceToMovePieceToLayer(cornerPos, 'y', 2, 10);
            if (seq) this.applyMoves(seq);
        }
        if (edgePos && edgePos[1] !== 2) {
            const seq2 = this._findSequenceToMovePieceToLayer(edgePos, 'y', 2, 10);
            if (seq2) this.applyMoves(seq2);
        }

        // Try standard insertion algorithms with rotations
        const insertionAlgs = [
            ['R', 'U', 'R', "U'"],
            ['U', 'R', 'U', "R'"],
            ['F', "U'", "F'"],
        ];

        const solved = SolvingServiceV2.solvedState();

        for (let algIdx = 0; algIdx < insertionAlgs.length; algIdx++) {
            for (let rotation = 0; rotation < 4; rotation++) {
                this.applyMoves(insertionAlgs[algIdx]);

                // Check if solved
                const solvedSlot = solved[slot[0]][slot[1]][slot[2]];
                const currentSlot = this.cube[slot[0]][slot[1]][slot[2]];
                const orientationCorrect = ['U', 'D', 'L', 'R', 'F', 'B'].every(
                    (face) => currentSlot[face as Face] === solvedSlot[face as Face]
                );

                if (orientationCorrect) return;
                if (rotation < 3) this.applyMove('U');
            }
        }
    }

    // OLL 2-look: first make U-cross, then orient corners
    solveOLL2Look(): void {
        // Step 1: make cross on U using standard alg: F R U R' U' F'
        const crossAlg = "F R U R' U' F'";
        for (let iter = 0; iter < 6; iter++) {
            if (this._isUCross()) break;
            this.applyMoves(crossAlg);
        }
        // Step 2: orient corners using R U R' U R U2 R' (sune-like)
        const cornerAlg = "R U R' U R U2 R'";
        for (let iter = 0; iter < 10; iter++) {
            if (this._areAllUOriented()) break;
            const before = this._countUOrientedStickers();
            this.applyMoves(cornerAlg);
            if (this._countUOrientedStickers() <= before) this.applyMove('U');
        }
    }

    // PLL 2-look: permute corners then edges. We'll implement a minimal set of algorithms
    solvePLL2Look(): void {
        if (!this._areCornersPermuted()) {
            const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
            this.applyMoves(T);
        }
        if (!this._areEdgesPermuted()) {
            const Up = "R U' R U R U R U' R' U' R2";
            this.applyMoves(Up);
        }
    }



    // ---------------- Helper routines for CFOP ----------------
    pruneInverseMoves(): void {
        for (let i = this.moves.length - 2; i >= 0; i--) {
            const current = this.moves[i];
            const next = this.moves[i + 1];
            if (inverse(current) === next) {
                this.moves.splice(i, 2);
            }
        }
    }

    _findAnySticker(color: string): StitcherResult | null {
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    const cub = this.cube[x][y][z];
                    for (const face of ['U', 'D', 'L', 'R', 'F', 'B'] as Face[]) {
                        if (cub[face] === color) return { pos: [x, y, z], face };
                    }
                }
            }
        }
        return null;
    }

    _findSequenceToPlaceSticker(
        startPos: Coordinate,
        startFace: Face,
        targetPos: Coordinate,
        targetFace: Face,
        maxDepth: number = 8
    ): string[] | null {
        const moves = ['R', "R'", 'R2', 'L', "L'", 'L2', 'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2'];
        const startCube = new SolvingServiceV2(this.cube);
        const color = this.cube[startPos[0]][startPos[1]][startPos[2]][startFace];
        if (!color) return null;

        const isGoal = (c: SolvingServiceV2): boolean => {
            const [tx, ty, tz] = targetPos;
            const targetSticker = c.cube[tx][ty][tz][targetFace];
            return targetSticker === color;
        };

        if (isGoal(startCube)) return [];
        const visited = new Set<string>();
        const q: QueueNode[] = [{ cube: startCube, seq: [], last: null }];
        visited.add(this._fingerprint(startCube));

        while (q.length) {
            const node = q.shift();
            if (!node) break;
            if (node.seq.length >= maxDepth) continue;

            for (const m of moves) {
                // Skip inverse moves
                if (node.last && inverse(node.last) === m) continue;

                const nc = new SolvingServiceV2(node.cube.cube);
                nc.applyMove(m);
                const key = this._fingerprint(nc);

                if (visited.has(key)) continue;
                visited.add(key);

                const newSeq = node.seq.concat([m]);
                if (isGoal(nc)) return newSeq;

                // Only continue BFS if not hitting depth limit
                if (newSeq.length < maxDepth) {
                    q.push({ cube: nc, seq: newSeq, last: m });
                }
            }
        }
        return null;
    }

    _findSequenceToMovePieceToLayer(
        startPos: Coordinate,
        axis: Axis,
        layerIndex: number,
        maxDepth: number = 8
    ): string[] | null {
        const moves = ['R', "R'", 'R2', 'L', "L'", 'L2', 'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2'];
        const startCube = new SolvingServiceV2(this.cube);

        const isGoal = (c: SolvingServiceV2): boolean => {
            const targetColors = startCube.cube[startPos[0]][startPos[1]][startPos[2]];
            const targetSet = new Set<string>(Object.values(targetColors).filter(Boolean) as string[]);

            for (let x = 0; x < 3; x++) {
                for (let y = 0; y < 3; y++) {
                    for (let z = 0; z < 3; z++) {
                        // Check constraint based on axis
                        if (axis === 'x' && x !== layerIndex) continue;
                        if (axis === 'y' && y !== layerIndex) continue;
                        if (axis === 'z' && z !== layerIndex) continue;

                        const cub = c.cube[x][y][z];
                        const colors = Object.values(cub).filter(Boolean) as string[];
                        const s = new Set<string>(colors);

                        // Must match all colors and be exact size
                        if (targetSet.size === colors.length &&
                            targetSet.size === s.size &&
                            [...targetSet].every(v => s.has(v))) {
                            return true;
                        }
                    }
                }
            }
            return false;
        };

        if (isGoal(startCube)) return [];
        const visited = new Set<string>();
        const q: QueueNode[] = [{ cube: startCube, seq: [], last: null }];
        visited.add(this._fingerprint(startCube));

        let nodesExplored = 0;
        const maxNodes = 50000; // Prevent memory explosion

        while (q.length && nodesExplored < maxNodes) {
            const node = q.shift();
            if (!node) break;

            nodesExplored++;
            if (node.seq.length >= maxDepth) continue;

            for (const m of moves) {
                if (node.last && inverse(node.last) === m) continue;

                const nc = new SolvingServiceV2(node.cube.cube);
                nc.applyMove(m);
                const key = this._fingerprint(nc);

                if (visited.has(key)) continue;
                visited.add(key);

                const newSeq = node.seq.concat([m]);
                if (isGoal(nc)) return newSeq;

                if (newSeq.length < maxDepth) {
                    q.push({ cube: nc, seq: newSeq, last: m });
                }
            }
        }

        return null;
    }

    _fingerprint(cube: SolvingServiceV2): string {
        const arr: string[] = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    const it = cube.cube[x][y][z];
                    arr.push([it.U, it.D, it.L, it.R, it.F, it.B].map(v => v || '.').join(''));
                }
            }
        }
        return arr.join('|');
    }

    _colorsForCorner(coord: Coordinate): string[] {
        const solved = SolvingServiceV2.solvedState();
        const c = solved[coord[0]][coord[1]][coord[2]];
        return Object.values(c).filter(Boolean) as string[];
    }

    _colorsForEdge(coord: Coordinate): string[] {
        const solved = SolvingServiceV2.solvedState();
        const c = solved[coord[0]][coord[1]][coord[2]];
        return Object.values(c).filter(Boolean) as string[];
    }

    _edgePositionBetweenCornerFaces(cornerCoord: Coordinate): Coordinate {
        const sx = cornerCoord[0] === 0 ? 1 : cornerCoord[0] === 2 ? 1 : 1;
        const sy = cornerCoord[1];
        const sz = cornerCoord[2] === 0 ? 1 : cornerCoord[2] === 2 ? 1 : 1;
        return [sx, sy, sz];
    }

    _isUCross(): boolean {
        const target = this.cube[1][2][1].U;
        const edgeCoords: Coordinate[] = [[1, 2, 0], [2, 2, 1], [1, 2, 2], [0, 2, 1]];
        for (const [x, y, z] of edgeCoords) {
            if (this.cube[x][y][z].U !== target) return false;
        }
        return true;
    }

    _countUOrientedStickers(): number {
        let cnt = 0;
        const target = this.cube[1][2][1].U;
        for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 3; z++) {
                if (this.cube[x][2][z].U === target) cnt++;
            }
        }
        return cnt;
    }

    _areAllUOriented(): boolean {
        return this._countUOrientedStickers() === 9;
    }

    _areCornersPermuted(): boolean {
        const solved = SolvingServiceV2.solvedState();
        const cornerCoords: Coordinate[] = [
            [2, 2, 2], [2, 2, 0], [0, 2, 0], [0, 2, 2],
            [2, 0, 2], [2, 0, 0], [0, 0, 0], [0, 0, 2]
        ];
        const mapSolved = new Map<string, boolean>();
        for (const c of cornerCoords) {
            const colors = Object.values(solved[c[0]][c[1]][c[2]])
                .filter(Boolean)
                .sort()
                .join('');
            mapSolved.set(colors, true);
        }
        for (const c of cornerCoords) {
            const colors = Object.values(this.cube[c[0]][c[1]][c[2]])
                .filter(Boolean)
                .sort()
                .join('');
            if (!mapSolved.has(colors)) return false;
        }
        return true;
    }

    _areEdgesPermuted(): boolean {
        const solved = SolvingServiceV2.solvedState();
        const edges: Coordinate[] = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    const cnt = Object.values(solved[x][y][z]).filter(Boolean).length;
                    if (cnt === 2) edges.push([x, y, z]);
                }
            }
        }
        const solvedSet = new Set<string>(
            edges.map(e =>
                Object.values(solved[e[0]][e[1]][e[2]])
                    .filter(Boolean)
                    .sort()
                    .join('')
            )
        );
        for (const e of edges) {
            const colors = Object.values(this.cube[e[0]][e[1]][e[2]])
                .filter(Boolean)
                .sort()
                .join('');
            if (!solvedSet.has(colors)) return false;
        }
        return true;
    }
}
