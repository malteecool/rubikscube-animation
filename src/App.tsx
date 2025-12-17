import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css'
import Cube from "cubejs";
import * as ColorMapping from './colorMapping';

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

    const logicalCube = new Cube();

    const gray = 0x808080;

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

    /**
     * Functions for converting cube move notation to grid layout rotations - and other way
     */
    const moveMap: { [key: string]: { axis: 'x' | 'y' | 'z'; index: number; direction: number }[] } = {
        'B': [{ axis: 'x', index: 2, direction: -1 }],
        "B'": [{ axis: 'x', index: 2, direction: 1 }],
        'B2': [{ axis: 'x', index: 2, direction: -1 }, { axis: 'x', index: 2, direction: -1 }],

        'F': [{ axis: 'x', index: 0, direction: 1 }],
        "F'": [{ axis: 'x', index: 0, direction: -1 }],
        'F2': [{ axis: 'x', index: 0, direction: 1 }, { axis: 'x', index: 0, direction: 1 }],

        'U': [{ axis: 'y', index: 2, direction: -1 }],
        "U'": [{ axis: 'y', index: 2, direction: 1 }],
        'U2': [{ axis: 'y', index: 2, direction: -1 }, { axis: 'y', index: 2, direction: -1 }],

        'D': [{ axis: 'y', index: 0, direction: 1 }],
        "D'": [{ axis: 'y', index: 0, direction: -1 }],
        'D2': [{ axis: 'y', index: 0, direction: 1 }, { axis: 'y', index: 0, direction: 1 }],

        'R': [{ axis: 'z', index: 2, direction: -1 }],
        "R'": [{ axis: 'z', index: 2, direction: 1 }],
        'R2': [{ axis: 'z', index: 2, direction: -1 }, { axis: 'z', index: 2, direction: -1 }],

        'L': [{ axis: 'z', index: 0, direction: 1 }],
        "L'": [{ axis: 'z', index: 0, direction: -1 }],
        'L2': [{ axis: 'z', index: 0, direction: 1 }, { axis: 'z', index: 0, direction: 1 }]
    };

    const reverseMap: { [key: string]: string } = {};

    for (const [notation, moves] of Object.entries(moveMap)) {
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

    // Causes stale closure issue so we need to use the ref as well. This could be reworked.
    const [userSelectedColorIndex, setUserSelectedColorIndex] = useState<number | null>(null);
    const [userSelectedColor, setUserSelectedColor] = useState<number | null>(null);
    const userSelectedColorRef = useRef<number | null>(null);
    const userSelectedColorIndexRef = useRef<number | null>(null);

    const updateUserSelectedColorMap = (index: number) => {

        if (index === userSelectedColorIndex) {
            setUserSelectedColorIndex(null);
            setUserSelectedColor(null);
            userSelectedColorIndexRef.current = null;
            userSelectedColorRef.current = null;
            return;
        }

        setUserSelectedColorIndex(index);
        setUserSelectedColor(ColorMapping.colors[index]);

        userSelectedColorIndexRef.current = index;
        userSelectedColorRef.current = ColorMapping.colors[index];
    };

    useEffect(() => {
        userSelectedColorRef.current = userSelectedColor;
    }, [userSelectedColor]);

    // UUUUUUUUURRRDRRDLBFFFDFFDRRRFFRDBLDDLLLLLLDDBBBBFBBFBL
    const solve = () => {
        if (!cubeRef.current || dragRef.current.isMoving) return;
        //Cube.initSolver();
        console.log('solver initialized');
        const newCube = Cube.fromString(toString());

        console.log('cube0', logicalCube.asString())
        console.log('cube1', newCube.asString())
        console.log('cube2', toString())

        /*const solvedMoves: string = newCube.solve();
        moveQueue = [];

        logicalCube.move(solvedMoves);

        solvedMoves.split(" ").forEach(move => {
            // Since the solve algorithm returns moves in order start to finish
            // and the moveByQueue pops the last move added we need to unshift.
            // or change how the movequeue extracts values.
            // That involves changing the move/randomize/solve by inverse as well.
            moveQueue.unshift(...moveMap[move]);
        });
        console.log(moveQueue);
        solv = true;
        chainedMove = true;
        moveByQueue();*/

    }

    const solveByInverseMoves = () => {
        if (!cubeRef.current || dragRef.current.isMoving) return;
        // Run the greedy solver
        console.log('Solving cube...');
        chainedMove = true;
        solv = true;

        moveQueue.forEach(move => move.direction *= -1)

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

    }

    const moveByQueue = () => {
        if ((solv && moveQueue.length === 0) || (rand && randomizeMoveQueue.length === 0)) {
            console.log('All moves completed');
            chainedMove = false;
            solv = false;
            rand = false;
            return;
        }

        const move = rand ? randomizeMoveQueue.pop()! : moveQueue.pop()!;

        if (rand) {
            moveQueue.push({ axis: move.axis, index: move.index, direction: move.direction });
        }
        performRotation(move.axis, move.index, move.direction);
    };

    const isSolved = () => {
        console.log(logicalCube.isSolved());
        console.log(logicalCube.toJSON());
        console.log('cube', logicalCube.asString())
        console.log(toString())
    }

    const toString = () => {
        return (
            faceString("U") +
            faceString("R") +
            faceString("F") +
            faceString("D") +
            faceString("L") +
            faceString("B")
        );
    };

    function faceString(face: "U" | "D" | "L" | "R" | "F" | "B"): string {
        const result: string[] = [];

        const selector = {
            U: (p: any) => p.y === 2,
            D: (p: any) => p.y === 0,
            L: (p: any) => p.z === 2,
            R: (p: any) => p.z === 0,
            F: (p: any) => p.x === 0,
            B: (p: any) => p.x === 2,
        }[face];

        // Sorting order: row-major for each face
        const order = {
            U: (a: any, b: any) => b.userData.gridPosition.x - a.userData.gridPosition.x || b.userData.gridPosition.z - a.userData.gridPosition.z,
            D: (a: any, b: any) => a.userData.gridPosition.x - b.userData.gridPosition.x || b.userData.gridPosition.z - a.userData.gridPosition.z,
            F: (a: any, b: any) => b.userData.gridPosition.y - a.userData.gridPosition.y ||
                b.userData.gridPosition.z - a.userData.gridPosition.z,
            B: (a: any, b: any) => b.userData.gridPosition.y - a.userData.gridPosition.y ||
                b.userData.gridPosition.z - a.userData.gridPosition.z,
            R: (a: any, b: any) => b.userData.gridPosition.y - a.userData.gridPosition.y || a.userData.gridPosition.x - b.userData.gridPosition.x,
            L: (a: any, b: any) => b.userData.gridPosition.y - a.userData.gridPosition.y || b.userData.gridPosition.x - a.userData.gridPosition.x,
        }[face];

        const list = allCubesRef.current.filter(c => selector(c.userData.gridPosition));
        list.sort(order);
        const normal = ColorMapping.FACE_NORMALS[face];

        list.forEach(cubie => {
            result.push(ColorMapping.getStickerLetter(cubie, normal.clone(), face));
        });

        return result.join("");
    }

    const updateCubeColor = (clickedCube: THREE.Mesh, faceIndex: number, color?: number) => {
        //console.log('update cube color', faceIndex, color)
        if (Array.isArray(clickedCube.material)) {

            if (faceIndex < 0) {
                for (let i = 0; i < 6; i++) {
                    clickedCube.material[i].color.set(color)
                }
                return;
            }
            const materialIndex = Math.floor(faceIndex / 2);
            console.log('update cube color', materialIndex, color)
            clickedCube.material[materialIndex].color.set(color)

        }
    }

    const clearCubeColor = () => {

        allCubesRef.current.forEach(cubie => {

            const x = cubie.userData.gridPosition.x;
            const y = cubie.userData.gridPosition.y;
            const z = cubie.userData.gridPosition.z;

            // We only give the center cubies color on init
            const colored = (x === 0 && y === 1 && z === 1)
                || (x === 1 && y === 1 && z === 2)
                || (x === 1 && y === 1 && z === 0)
                || (x === 2 && y === 1 && z === 1)
                || (x === 1 && y === 2 && z === 1)
                || (x === 1 && y === 0 && z === 1)

            if (!colored) {
                updateCubeColor(cubie, -1, gray)
            }
        })


    }

    const getClickedFace = (intersection: THREE.Intersection, clickedCube: THREE.Mesh) => {

        const worldPoint = intersection.point.clone();
        const localPoint = group.worldToLocal(worldPoint.clone());

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

            if (userSelectedColorRef.current) {
                updateCubeColor(clickedCube, hit.faceIndex!, userSelectedColorRef.current!);
            }

            console.log('faceindex: ', hit.faceIndex!)
            console.log(clickedCube.userData.gridPosition);
            dragRef.current.clickFace = getClickedFace(hit, clickedCube);
            dragRef.current.clickWorldPoint.copy(hit.point);
            dragRef.current.clickDistance = hit.distance;
        } else {
            // Rotation
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
            const camera = cameraRef.current;
            const cubeCenter = new THREE.Vector3(0, 0, 0);

            const offset = camera.position.clone().sub(cubeCenter);

            const yAxis = new THREE.Vector3(0, 1, 0);
            const qY = new THREE.Quaternion().setFromAxisAngle(yAxis, deltaX * -0.005);
            offset.applyQuaternion(qY);

            const xAxis = new THREE.Vector3(1, 0, 0);
            const qX = new THREE.Quaternion().setFromAxisAngle(xAxis, deltaY * -0.005);
            offset.applyQuaternion(qX);

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

            const rect = rendererRef.current.domElement.getBoundingClientRect();
            const ndcEnd = new THREE.Vector2(
                ((end.x - rect.left) / rect.width) * 2 - 1,
                -((end.y - rect.top) / rect.height) * 2 + 1
            );

            raycasterRef.current.setFromCamera(ndcEnd, cameraRef.current);
            const endWorld = raycasterRef.current.ray.origin.clone().add(raycasterRef.current.ray.direction.clone().multiplyScalar(dragRef.current.clickDistance));

            const cubeGroup = cubeRef.current as THREE.Group;
            const startLocal = cubeGroup.worldToLocal(dragRef.current.clickWorldPoint.clone());
            const endLocal = cubeGroup.worldToLocal(endWorld.clone());
            const localDrag = new THREE.Vector3().subVectors(endLocal, startLocal);

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

            // invert the direction for x face since its odd
            /*if (face === 'y') {
                dir *= -1
            }*/

            if (dist > 50) {
                console.log(moveToNotation([{ axis: rotateAxis, index: clickedIndex, direction: dir }]))
                performRotation(rotateAxis, clickedIndex, dir);
                moveQueue.push({ axis: rotateAxis, index: clickedIndex, direction: dir });
                if (rotateAxis === 'y' || rotateAxis === 'x') {
                    dir *= -1;
                    console.log('dir', dir)
                }
                logicalCube.move(moveToNotation([{ axis: rotateAxis, index: clickedIndex, direction: dir }]));
            }
            dragRef.current.clickedCube = null;
            dragRef.current.clickFace = null;
        }
    };

    const performRotation = (axis: 'x' | 'y' | 'z', clickedIndex: number, direction: number) => {

        if (!cubeRef.current || dragRef.current.isMoving) return;

        dragRef.current.isMoving = true;

        if (Math.abs(direction) === 2) {
            console.log('singleDirection')
            const singleDirection = Math.sign(direction);
            performRotation(axis, clickedIndex, singleDirection);
            return;
        }

        console.log(`Rotating axis ${axis} at index ${clickedIndex} in direction ${direction}`);

        const mainGroup = cubeRef.current;

        const active: THREE.Mesh[] = [];
        allCubesRef.current.forEach(c => {
            const gp = c.userData.gridPosition as { x: number; y: number; z: number };
            if (gp[axis] === clickedIndex) active.push(c);
        });

        if (active.length === 0) {
            dragRef.current.isMoving = false;
            return;
        }

        const pivot = pivotRef.current;
        pivot.rotation.set(0, 0, 0);
        pivot.updateMatrixWorld(true);

        active.forEach(c => pivot.attach(c));
        const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const target = Math.PI / 2 * direction;
        let accumulated = 0;
        const speed = 0.15;
        const updateGridPositions = () => {
            active.forEach(c => {
                const gp = c.userData.gridPosition as any;
                let nx = gp.x, ny = gp.y, nz = gp.z;

                if (axis === 'x') {
                    const oldY = ny;
                    if (direction > 0) {
                        ny = 2 - nz;
                        nz = oldY;
                    } else {
                        ny = nz;
                        nz = 2 - oldY;
                    }
                } else if (axis === 'y') {
                    const oldX = nx;
                    if (direction > 0) {
                        nx = nz;
                        nz = 2 - oldX;
                    } else {
                        nx = 2 - nz;
                        nz = oldX;
                    }
                } else if (axis === 'z') {
                    const oldX = nx;
                    if (direction > 0) {
                        nx = 2 - ny;
                        ny = oldX;
                    } else {
                        nx = ny;
                        ny = 2 - oldX;
                    }
                }
                c.userData.gridPosition = { x: nx, y: ny, z: nz };
            });
        }

        const step = () => {
            const remaining = Math.abs(target) - Math.abs(accumulated);
            if (remaining <= 0.0001) {
                const toRotate = target - accumulated;
                if (Math.abs(toRotate) > 0.0001) pivot.rotateOnAxis(axisVec, toRotate); // Snap to target

                updateGridPositions();
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

        if (containerRef.current.children.length > 0) {
            return;
        }

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(80, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
        camera.position.set(0, 0, 4);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Cube
        scene.add(group);
        cubeRef.current = group;
        pivotRef.current.name = 'pivot';
        scene.add(pivotRef.current);

        // Create 3x3x3 grid of smaller cubes
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {


                    const materials = ColorMapping.colors.map(color =>
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
        <div className="app-root">
            <div ref={containerRef} className="app-container" />

            <div className="color-selector">
                {
                    ColorMapping.nameColorMap.map((color, index) => {
                        return (
                            <button
                                className={userSelectedColorIndex === index ? "selected" : ""}
                                onClick={() => updateUserSelectedColorMap(index)}
                            >
                                {color.name}
                            </button>
                        )
                    })
                }
                <button
                    className={""}
                    onClick={() => clearCubeColor()}
                >
                    Clear colors
                </button>
            </div>

            <div className="bottom-bar">
                <button onClick={isSolved}>is solved</button>
                <button onClick={solve}>Solve</button>
                <button onClick={solveByInverseMoves}>Solve by inverse moves</button>
                <button onClick={revert}>Revert latest move</button>
                <button onClick={randomize}>Randomize</button>
            </div>
        </div>
    )
}

export default App
