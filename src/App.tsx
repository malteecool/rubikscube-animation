import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './App.css'
import Cube from "cubejs";

function App() {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cubeRef = useRef<THREE.Group | null>(null);
    const pivotRef = useRef(new THREE.Group());
    const allCubesRef = useRef<THREE.Mesh[]>([]);
    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());
    const group = new THREE.Group();
    const dragRef = useRef({
        isDragging: false,
        dragEndPosition: { x: 0, y: 0 },
        dragStartPosition: { x: 0, y: 0 },
        dragMode: 'full' as 'full' | 'face',
        clickVector: { x: 0, y: 0, z: 0 } as { x: number; y: number; z: number },
        clickFace: null as 'x' | 'y' | 'z' | null,
        clickedCube: null as THREE.Mesh | null,
        clickWorldPoint: new THREE.Vector3(),
        clickDistance: 0,
        isMoving: false
    });

    const cubeSize = 0.6;
    const spacing = 0.02;
    const colors = [
        0xff6b00, // orange - index 0 (Right/+X)
        0xff0000, // red    - index 1 (Left/-X)
        0xffffff, // white  - index 2 (Top/+Y)
        0xffff00, // yellow - index 3 (Bottom/-Y)
        0x0000ff, // blue   - index 4 (Front/+Z)
        0x00ff00, // green  - index 5 (Back/-Z)
    ];

    var chainedMove = false;

    var moveQueue: { axis: 'x' | 'y' | 'z'; index: number; direction: number }[] = [];
    // Keep a seperate queue for randomize moves, so 
    var randomizeMoveQueue: { axis: 'x' | 'y' | 'z'; index: number; direction: number }[] = [];

    // Transitions matrix: which axis to rotate for each face-drag action
    const transitions: { [k: string]: { [k: string]: 'x' | 'y' | 'z' } } = {
        'x': { 'y': 'z', 'z': 'y' },
        'y': { 'x': 'z', 'z': 'x' },
        'z': { 'x': 'y', 'y': 'x' }
    };

    const principalComponent = (v: { x: number; y: number; z: number }): 'x' | 'y' | 'z' => {
        var maxAxis: 'x' | 'y' | 'z' = 'x',
            max = Math.abs(v.x);
        if (Math.abs(v.y) > max) {
            maxAxis = 'y';
            max = Math.abs(v.y);
        }
        if (Math.abs(v.z) > max) {
            maxAxis = 'z';
            max = Math.abs(v.z);
        }
        return maxAxis;
    };

    var solv = false;

    // Build a cube state from current gridPositions for solving
    const buildCubeState = () => {
        // Initialize a 3D cube array with face colors
        const state: any = [];

        for (let x = 0; x < 3; x++) {
            state[x] = [];
            for (let y = 0; y < 3; y++) {
                state[x][y] = [];
                for (let z = 0; z < 3; z++) {
                    // Initialize face stickers (null if not present)
                    state[x][y][z] = {
                        U: null, D: null, L: null, R: null, F: null, B: null
                    };
                }
            }
        }
        allCubesRef.current.forEach(cube => {
            const gp = cube.userData.gridPosition as { x: number; y: number; z: number };
            const faceColors = cube.userData.faceColors as { [key: string]: string };

            // Assign visible faces based on current gridPosition and current face colors
            if (gp.x === 2 && faceColors.R) state[gp.x][gp.y][gp.z].R = faceColors.R;
            if (gp.x === 0 && faceColors.L) state[gp.x][gp.y][gp.z].L = faceColors.L;
            if (gp.y === 2 && faceColors.U) state[gp.x][gp.y][gp.z].U = faceColors.U;
            if (gp.y === 0 && faceColors.D) state[gp.x][gp.y][gp.z].D = faceColors.D;
            if (gp.z === 2 && faceColors.F) state[gp.x][gp.y][gp.z].F = faceColors.F;
            if (gp.z === 0 && faceColors.B) state[gp.x][gp.y][gp.z].B = faceColors.B;
        });
        return state;
    };

    /**
     * Functions for converting cube move notation to grid layout rotations - and other way
     */
    const moveMap: { [key: string]: { axis: 'x' | 'y' | 'z'; index: number; direction: number }[] } = {
        'R': [{ axis: 'x', index: 2, direction: 1 }],
        "R'": [{ axis: 'x', index: 2, direction: -1 }],
        'R2': [{ axis: 'x', index: 2, direction: 1 }, { axis: 'x', index: 2, direction: 1 }],

        'L': [{ axis: 'x', index: 0, direction: -1 }],
        "L'": [{ axis: 'x', index: 0, direction: 1 }],
        'L2': [{ axis: 'x', index: 0, direction: -1 }, { axis: 'x', index: 0, direction: -1 }],

        'U': [{ axis: 'y', index: 2, direction: 1 }],
        "U'": [{ axis: 'y', index: 2, direction: -1 }],
        'U2': [{ axis: 'y', index: 2, direction: 1 }, { axis: 'y', index: 2, direction: 1 }],

        'D': [{ axis: 'y', index: 0, direction: -1 }],
        "D'": [{ axis: 'y', index: 0, direction: 1 }],
        'D2': [{ axis: 'y', index: 0, direction: -1 }, { axis: 'y', index: 0, direction: -1 }],

        'F': [{ axis: 'z', index: 2, direction: 1 }],
        "F'": [{ axis: 'z', index: 2, direction: -1 }],
        'F2': [{ axis: 'z', index: 2, direction: 1 }, { axis: 'z', index: 2, direction: 1 }],

        'B': [{ axis: 'z', index: 0, direction: -1 }],
        "B'": [{ axis: 'z', index: 0, direction: 1 }],
        'B2': [{ axis: 'z', index: 0, direction: -1 }, { axis: 'z', index: 0, direction: -1 }]
    };

    const reverseMap: { [key: string]: string } = {};

    for (const [notation, moves] of Object.entries(moveMap)) {
        // Every move in the list should map back to this notation
        // (R2 has two identical moves, both map to "R2")
        for (const move of moves) {
            const key = `${move.axis}:${move.index}:${move.direction}:${moves.length}`;
            reverseMap[key] = notation;
        }
    }

    const moveToNotation = (moves: { axis: 'x' | 'y' | 'z'; index: number; direction: number }[]): string => {
        if (!moves) return '';

        // We assume moves all describe the same slice, just repeated
        const { axis, index, direction } = moves[0];
        const key = `${axis}:${index}:${direction}:${moves.length}`;

        return reverseMap[key] ?? '';
    };

    const solve = () => {
        if (!cubeRef.current || dragRef.current.isMoving) return;

        const cube = new Cube();
        moveQueue.forEach(move => {
            //parsedMoves.push(moveToNotation(move));
            console.log(moveToNotation([move]));
            cube.move(moveToNotation([move]));
        });

        console.log(cube.isSolved())
        //console.log(cube.toJSON())

        Cube.initSolver();

        const solvedMoves: string = cube.solve();
        console.log('solvedMoves', solvedMoves);
        moveQueue = [];

        solvedMoves.split(" ").forEach(move => {
            moveQueue.push(...moveMap[move]);
        });
        console.log(moveQueue);
        solv = true;
        chainedMove = true;
        moveByQueue();

    }
    const solveByInverseMoves = () => {
        // Use CubeService solver to find solution
        if (!cubeRef.current || dragRef.current.isMoving) return;
        // Run the greedy solver
        console.log('Solving cube...');
        chainedMove = true;
        solv = true;
        moveByQueue();
    };

    const revert = () => {
        // implement a simple solver that resets the cube to initial state
        if (!cubeRef.current || dragRef.current.isMoving) return;
        if (moveQueue.length === 0) {
            return;
        }
        moveByQueue();
    }
    var rand = false;
    const randomize = () => {
        if (!cubeRef.current || dragRef.current.isMoving) return;

        const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
        for (let i = 0; i < 20; i++) {
            const axis = axes[Math.floor(Math.random() * 3)] as 'x' | 'y' | 'z';
            const index = Math.floor(Math.random() * 3);
            const direction = Math.random() < 0.5 ? 1 : -1;
            randomizeMoveQueue.push({ axis, index, direction });
        }
        chainedMove = true;
        rand = true;
        moveByQueue();

        /*const moves = solutionService.scramble(1);
        console.log(moves);
        const parsedMoves = moves.flatMap(m => parseMoveNotation(m));
        console.log(parsedMoves);
        randomizeMoveQueue.push(...parsedMoves);*/

    }

    const moveByQueue = () => {
        if ((solv && moveQueue.length === 0) || (rand && randomizeMoveQueue.length === 0)) {
            console.log('All moves completed');
            chainedMove = false;
            solv = false;
            rand = false;
            return;
        }
        // Get next move from appropriate queue
        if (rand) {
            const move = randomizeMoveQueue.pop()!;
            moveQueue.push({ axis: move.axis, index: move.index, direction: move.direction });
            performRotation(move.axis, move.index, move.direction);
        } else {
            const move = moveQueue.pop()!;
            // For solving, replay moves in reverse
            const moveDir = move.direction;
            performRotation(move.axis, move.index, moveDir);
        }
    };

    const getClickedFace = (intersection: THREE.Intersection, clickedCube: THREE.Mesh) => {
        // intersection.point is in world space; convert to cubeGroup local space
        const worldPoint = intersection.point.clone();
        const localPoint = group.worldToLocal(worldPoint.clone()); // into cubeGroup coordinates

        // But we want relative to the clicked cubie's center in cubeGroup coords
        const cubieWorldPos = clickedCube.getWorldPosition(new THREE.Vector3());
        const cubieLocalPos = group.worldToLocal(cubieWorldPos.clone());
        const relative = new THREE.Vector3().subVectors(localPoint, cubieLocalPos);


        const ax = Math.abs(relative.x), ay = Math.abs(relative.y), az = Math.abs(relative.z);
        if (ax >= ay && ax >= az) return 'x';
        if (ay >= ax && ay >= az) return 'y';
        return 'z';
    };

    const onMouseDown = (e: MouseEvent) => {
        dragRef.current.isDragging = true;
        dragRef.current.dragEndPosition = { x: e.clientX, y: e.clientY };
        dragRef.current.dragStartPosition = { x: e.clientX, y: e.clientY };

        if (!cameraRef.current || !rendererRef.current) return;

        const rect = rendererRef.current.domElement.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        console.log(mouseRef.current);

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const intersects = raycasterRef.current.intersectObjects(allCubesRef.current, false);

        if (intersects.length > 0) {
            // Face drag
            dragRef.current.dragMode = 'face';
            const hit = intersects[0];
            const clickedCube = hit.object as THREE.Mesh;
            dragRef.current.clickedCube = clickedCube;
            console.log(clickedCube.userData.gridPosition);
            dragRef.current.clickFace = getClickedFace(hit, clickedCube);
            dragRef.current.clickWorldPoint.copy(hit.point);
            dragRef.current.clickDistance = hit.distance; // distance along camera ray
        } else {
            dragRef.current.dragMode = 'full';
            dragRef.current.clickedCube = null;
            dragRef.current.clickFace = null;
        }
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!dragRef.current.isDragging) return;

        const deltaX = e.clientX - dragRef.current.dragEndPosition.x;
        const deltaY = e.clientY - dragRef.current.dragEndPosition.y;

        if (dragRef.current.dragMode === 'full' && cameraRef.current) {
            // Orbit camera around the cube following cube's axes
            const camera = cameraRef.current;
            const cubeCenter = new THREE.Vector3(0, 0, 0);

            // Get current camera position relative to cube center
            const offset = camera.position.clone().sub(cubeCenter);

            // Horizontal drag: rotate around cube's Y axis
            const yAxis = new THREE.Vector3(0, 1, 0);
            const qY = new THREE.Quaternion().setFromAxisAngle(yAxis, deltaX * -0.005);
            offset.applyQuaternion(qY);

            // Vertical drag: rotate around cube's X axis (but only if not pointing straight up/down)
            const xAxis = new THREE.Vector3(1, 0, 0);
            const qX = new THREE.Quaternion().setFromAxisAngle(xAxis, deltaY * -0.005);
            offset.applyQuaternion(qX);

            // Apply new position
            camera.position.copy(cubeCenter.clone().add(offset));
            camera.lookAt(cubeCenter);
        }

        dragRef.current.dragEndPosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = (e: MouseEvent) => {
        const wasDragging = dragRef.current.isDragging;
        dragRef.current.isDragging = false;
        dragRef.current.dragEndPosition = { x: e.clientX, y: e.clientY };

        if (!cameraRef.current || !rendererRef.current) return;

        if (!wasDragging) return;

        if (dragRef.current.dragMode === 'face' && dragRef.current.clickedCube && dragRef.current.clickFace && !dragRef.current.isMoving) {
            const start = dragRef.current.dragStartPosition;
            const end = dragRef.current.dragEndPosition;

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // compute world point for end mouse at the same distance as start click
            const rect = rendererRef.current.domElement.getBoundingClientRect();
            const ndcEnd = new THREE.Vector2(
                ((end.x - rect.left) / rect.width) * 2 - 1,
                -((end.y - rect.top) / rect.height) * 2 + 1
            );

            // get a world point along new ray at the same distance from camera as original click
            raycasterRef.current.setFromCamera(ndcEnd, cameraRef.current);
            const endWorld = raycasterRef.current.ray.origin.clone().add(raycasterRef.current.ray.direction.clone().multiplyScalar(dragRef.current.clickDistance));

            // convert both points into cubeGroup-local space and compute local drag
            const cubeGroup = cubeRef.current as THREE.Group;
            const startLocal = cubeGroup.worldToLocal(dragRef.current.clickWorldPoint.clone());
            const endLocal = cubeGroup.worldToLocal(endWorld.clone());
            const localDrag = new THREE.Vector3().subVectors(endLocal, startLocal);

            // zero out the face axis (we don't want to consider drag towards/away from face)
            const face = dragRef.current.clickFace as 'x' | 'y' | 'z';
            (localDrag as any)[face] = 0;
            let dir = 0;
            if (start.y - end.y > 10) {

                if (Math.abs(start.y - end.y) > Math.abs(start.x - end.x)) {
                    console.log('up');
                    dir = -1
                }
            }
            if (start.y - end.y < -10) {
                if (Math.abs(start.y - end.y) > Math.abs(start.x - end.x)) {
                    console.log('down');
                    dir = 1
                }
            }
            if (start.x - end.x > 10) {
                if (Math.abs(start.x - end.x) > Math.abs(start.y - end.y)) {
                    console.log('left');
                    dir = -1
                }
            }
            if (start.x - end.x < -10) {
                if (Math.abs(start.x - end.x) > Math.abs(start.y - end.y)) {
                    console.log('right');
                    dir = 1
                }
            }

            const maxAxis = principalComponent(localDrag);
            const rotateAxis = transitions[face][maxAxis];
            const clickedIndex = (dragRef.current.clickedCube!.userData.gridPosition as any)[rotateAxis];
            if (dist > 50) {
                performRotation(rotateAxis, clickedIndex, dir);
                moveQueue.push({ axis: rotateAxis, index: clickedIndex, direction: dir });
            }
            dragRef.current.clickedCube = null;
            dragRef.current.clickFace = null;
        }
    };

    const performRotation = (axis: 'x' | 'y' | 'z', clickedIndex: number, direction: number) => {

        if (!cubeRef.current || dragRef.current.isMoving) return;

        dragRef.current.isMoving = true;

        // Handle double moves by calling twice with direction 1 or -1
        if (Math.abs(direction) === 2) {
            const singleDirection = Math.sign(direction);
            performRotation(axis, clickedIndex, singleDirection);
            // The chainedMove mechanism will handle subsequent rotations via callback
            return;
        }

        console.log(`Rotating axis ${axis} at index ${clickedIndex} in direction ${direction}`);

        const mainGroup = cubeRef.current;

        // pick cubies matching logical gridPosition
        const active: THREE.Mesh[] = [];
        allCubesRef.current.forEach(c => {
            const gp = c.userData.gridPosition as { x: number; y: number; z: number };
            if (gp[axis] === clickedIndex) active.push(c);
        });

        if (active.length === 0) {
            dragRef.current.isMoving = false;
            return;
        }

        // position pivot at the slice plane center in cubeGroup-local coordinates
        const pivot = pivotRef.current;
        //pivot.position.set(0, 0, 0);
        pivot.rotation.set(0, 0, 0);
        pivot.updateMatrixWorld(true);

        // attach active cubies to pivot (pivot already child of cubeGroup so attaches preserve local coords)
        active.forEach(c => pivot.attach(c));
        // animate rotation in pivot (pivot local axes follow cube orientation)
        const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const target = Math.PI / 2 * direction;
        let accumulated = 0;
        const speed = 0.15; // radians per frame (coarse)
        const updateGridPositions = () => {
            active.forEach(c => {
                const gp = c.userData.gridPosition as any;
                const faceColors = c.userData.faceColors as any;
                let nx = gp.x, ny = gp.y, nz = gp.z;
                //console.log('oldFaceColors', faceColors);
                // Rotate face colors along with gridPosition
                let newFaceColors = { ...faceColors };

                if (axis === 'x') {
                    const oldY = ny;
                    if (direction > 0) {
                        ny = 2 - nz;
                        nz = oldY;
                        // Rotate face colors: F->U->B->D->F
                        const tempB = faceColors.B;
                        newFaceColors.F = faceColors.U;
                        newFaceColors.D = faceColors.F;
                        newFaceColors.B = faceColors.D;
                        newFaceColors.U = tempB;
                    } else {
                        ny = nz;
                        nz = 2 - oldY;
                        // Reverse rotation

                        const tempB = faceColors.B;
                        newFaceColors.F = faceColors.D;
                        newFaceColors.U = faceColors.F;
                        newFaceColors.B = faceColors.U;
                        newFaceColors.D = tempB;
                    }
                } else if (axis === 'y') {
                    const oldX = nx;
                    if (direction > 0) {
                        nx = nz;
                        nz = 2 - oldX;

                        const tempL = faceColors.L;
                        newFaceColors.R = faceColors.F;
                        newFaceColors.B = faceColors.R;
                        newFaceColors.L = faceColors.B;
                        //console.log(tempL)
                        newFaceColors.F = tempL;
                    } else {
                        nx = 2 - nz;
                        nz = oldX;
                        // Reverse rotation
                        const tempL = faceColors.L;
                        newFaceColors.L = faceColors.F;
                        newFaceColors.F = faceColors.R;
                        newFaceColors.R = faceColors.B;
                        newFaceColors.B = tempL;
                    }
                } else if (axis === 'z') {
                    const oldX = nx;
                    if (direction > 0) {
                        nx = 2 - ny;
                        ny = oldX;
                        // Rotate face colors: U->L->D->R->U
                        const tempU = newFaceColors.U;
                        newFaceColors.U = newFaceColors.R;
                        newFaceColors.R = newFaceColors.D;
                        newFaceColors.D = newFaceColors.L;
                        newFaceColors.L = tempU;
                    } else {
                        nx = ny;
                        ny = 2 - oldX;
                        // Reverse rotation
                        const tempU = newFaceColors.U;
                        newFaceColors.U = newFaceColors.L;
                        newFaceColors.L = newFaceColors.D;
                        newFaceColors.D = newFaceColors.R;
                        newFaceColors.R = tempU;
                    }
                }
                c.userData.gridPosition = { x: nx, y: ny, z: nz };
                //console.log("newFaceColors", newFaceColors);
                c.userData.faceColors = newFaceColors;
            });
        }

        const step = () => {
            const remaining = Math.abs(target) - Math.abs(accumulated);
            if (remaining <= 0.0001) {
                // finish
                // snap exact
                // set pivot rotation around axis to target
                // we will rotate residual to match exactly
                const toRotate = target - accumulated;
                if (Math.abs(toRotate) > 0.0001) pivot.rotateOnAxis(axisVec, toRotate);

                // update logical grid positions
                updateGridPositions();
                // detach back to main group
                active.forEach(c => mainGroup!.attach(c));
                dragRef.current.isMoving = false;
                console.log('Rotation complete');
                if (chainedMove) {
                    moveByQueue();
                }
                return;
            }

            const delta = Math.min(speed, remaining);
            pivot.rotateOnAxis(axisVec, Math.sign(target) * delta);
            accumulated += delta * Math.sign(target);
            requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
    };

    useEffect(() => {
        if (!containerRef.current) return;

        // Check if canvas already exists to prevent duplicates
        if (containerRef.current.children.length > 0) {
            return;
        }

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(50, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
        camera.position.set(0, 0, 4);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Create 3x3x3 Rubik's cube

        scene.add(group);
        cubeRef.current = group;
        pivotRef.current.name = 'pivot';
        scene.add(pivotRef.current);

        // Create 3x3x3 grid of smaller cubes
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {

                    const materials = colors.map(color =>
                        new THREE.MeshPhongMaterial({
                            color: color,
                            emissive: 0x111111,
                            shininess: 200
                        })
                    );

                    var cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
                    var cube = new THREE.Mesh(cubeGeometry, materials);
                    cube.castShadow = true;

                    scene.add(cube);

                    const posX = (x - 1) * (cubeSize + spacing);
                    const posY = (y - 1) * (cubeSize + spacing);
                    const posZ = (z - 1) * (cubeSize + spacing);

                    cube.position.set(posX, posY, posZ);
                    cube.userData.gridPosition = { x, y, z };

                    // Store face colors by face direction (these rotate with the cube)
                    let faceColors: { [key: string]: string } = {};
                    const colorKeys = ['O', 'R', 'W', 'Y', 'B', 'G'];
                    // Index mapping (matches Three.js BoxGeometry material order):
                    // 0=Right/R, 1=Left/L, 2=Top/U, 3=Bottom/D, 4=Front/F, 5=Back/B

                    if (x === 2) faceColors.R = colorKeys[0]; // Right = Orange
                    if (x === 0) faceColors.L = colorKeys[1]; // Left = Red
                    if (y === 2) faceColors.U = colorKeys[2]; // Up = White
                    if (y === 0) faceColors.D = colorKeys[3]; // Down = Yellow
                    if (z === 2) faceColors.F = colorKeys[4]; // Front = Blue
                    if (z === 0) faceColors.B = colorKeys[5]; // Back = Green

                    cube.userData.faceColors = faceColors;

                    const edges = new THREE.EdgesGeometry(cubeGeometry);
                    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
                    cube.add(line);

                    group.add(cube);
                    allCubesRef.current.push(cube);
                }
            }
        }

        // Lighting
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        scene.add(light);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        // Handle window resize
        const handleResize = () => {
            if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;

            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(width, height);
        };

        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (containerRef.current && renderer.domElement.parentElement === containerRef.current) {
                containerRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    return (
        <div>
            <div ref={containerRef} className='app-container' />
            <div style={{ position: 'absolute', width: '100%', bottom: 10, flex: 1, alignContent: 'center', textAlign: 'center', marginTop: '10px' }}>
                <button style={{ margin: 10, backgroundColor: '#fff', color: 'black' }} onClick={solve}>Solve</button>
                <button style={{ margin: 10, backgroundColor: '#fff', color: 'black' }} onClick={solveByInverseMoves}>Solve by inverse moves</button>
                <button style={{ margin: 10, backgroundColor: '#fff', color: 'black' }} onClick={revert}>Revert latest move</button>
                <button style={{ margin: 10, backgroundColor: '#fff', color: 'black' }} onClick={randomize}>Randomize</button>
            </div>
        </div>
    )
}

export default App
