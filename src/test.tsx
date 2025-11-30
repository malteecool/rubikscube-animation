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
        const group = new THREE.Group();
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

                    cube.userData.rubikPosition = cube.position.clone();

                    scene.add(cube);

                    const posX = (x - 1) * (cubeSize + spacing);
                    const posY = (y - 1) * (cubeSize + spacing);
                    const posZ = (z - 1) * (cubeSize + spacing);

                    cube.position.set(posX, posY, posZ);
                    cube.userData.gridPosition = { x, y, z };
                    console.log({ x, y, z })

                    const edges = new THREE.EdgesGeometry(cubeGeometry);
                    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
                    cube.add(line);

                    group.add(cube);
                    allCubesRef.current.push(cube);
                    console.log(allCubesRef.current.length)
                }
            }
        }

        // Lighting
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        scene.add(light);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);


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

    const rect = renderer.domElement.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    console.log(mouseRef.current);

    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const intersects = raycasterRef.current.intersectObjects(allCubesRef.current, false);

    console.log(intersects)
    if (intersects.length > 0) {
        // Face drag
        dragRef.current.dragMode = 'face';
        const hit = intersects[0];
        const clickedCube = hit.object as THREE.Mesh;
        dragRef.current.clickedCube = clickedCube;
        dragRef.current.clickFace = getClickedFace(hit, clickedCube);
        console.log((intersects[0].object.userData.gridPosition));
        console.log('clicked face: ' + getClickedFace(intersects[0], (intersects[0].object as THREE.Mesh)))
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

var transitions = {
    'x': { 'y': 'z', 'z': 'y' },
    'y': { 'x': 'z', 'z': 'x' },
    'z': { 'x': 'y', 'y': 'x' }
}


const performRotation = (axis: 'x' | 'y' | 'z', clickedCube: THREE.Mesh, direction: number) => {
    console.log(`Rotating axis ${axis} in direction ${direction}`);
    const mainGroup = cubeRef.current;

    // Get the clicked cube's current position in local space
    const clickedLocalPos = group.worldToLocal(clickedCube.getWorldPosition(new THREE.Vector3()));

    // Round to nearest grid position to account for floating point errors
    const roundedPos = {
        x: Math.round(clickedLocalPos.x / (cubeSize + spacing)),
        y: Math.round(clickedLocalPos.y / (cubeSize + spacing)),
        z: Math.round(clickedLocalPos.z / (cubeSize + spacing))
    };

    // Clamp to valid grid range
    const sliceIndex = Math.max(0, Math.min(2,
        axis === 'x' ? roundedPos.x :
            axis === 'y' ? roundedPos.y :
                roundedPos.z
    ));

    console.log(`Rotating ${axis} axis at physical slice index ${sliceIndex}`);

    // pick cubies on the same physical plane perpendicular to the rotation axis
    const active: THREE.Mesh[] = [];
    allCubesRef.current.forEach(c => {
        const cLocalPos = group.worldToLocal(c.getWorldPosition(new THREE.Vector3()));
        const cRoundedPos = {
            x: Math.round(cLocalPos.x / (cubeSize + spacing)),
            y: Math.round(cLocalPos.y / (cubeSize + spacing)),
            z: Math.round(cLocalPos.z / (cubeSize + spacing))
        };

        // Check if this cube is on the same plane
        const cSliceIndex = axis === 'x' ? cRoundedPos.x :
            axis === 'y' ? cRoundedPos.y :
                cRoundedPos.z;

        if (cSliceIndex === sliceIndex) {
            active.push(c);
        }
    });

    console.log("active cubes:", active.length)

    if (active.length === 0) {
        dragRef.current.isMoving = false;
        return;
    }

    // position pivot at the slice plane center in cubeGroup-local coordinates
    const pivot = pivotRef.current;
    pivot.position.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);

    // attach active cubies to pivot (pivot already child of cubeGroup so attaches preserve local coords)
    active.forEach(c => pivot.attach(c));
    console.log(pivot)
    // animate rotation in pivot (pivot local axes follow cube orientation)
    const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const target = Math.PI / 2 * direction;
    let accumulated = 0;
    const speed = 0.15; // radians per frame (coarse)*/

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
            active.forEach(c => {
                const gp = c.userData.gridPosition as any;
                let nx = gp.x, ny = gp.y, nz = gp.z;

                // For a 90-degree rotation:
                // Rotating around X-axis (positive): y -> z, z -> -y (becomes 2-y in 0-2 range)
                // Rotating around Y-axis (positive): z -> x, x -> -z (becomes 2-z in 0-2 range)
                // Rotating around Z-axis (positive): x -> y, y -> -x (becomes 2-x in 0-2 range)
                /*
                Knas med hur vi byter index efter rotation
                */
                if (axis === 'x') {
                    const oldY = ny;
                    if (direction > 0) {
                        ny = nz;
                        nz = 2 - oldY;
                    } else {
                        ny = 2 - nz;
                        nz = oldY;
                    }
                } else if (axis === 'y') {
                    const oldZ = nz;
                    if (direction > 0) {
                        nz = nx;
                        nx = 2 - oldZ;
                    } else {
                        nz = 2 - nx;
                        nx = oldZ;
                    }
                } else if (axis === 'z') {
                    const oldX = nx;
                    if (direction > 0) {
                        nx = ny;
                        ny = 2 - oldX;
                    } else {
                        nx = 2 - ny;
                        ny = oldX;
                    }
                }
                console.log({ x: nx, y: ny, z: nz })
                c.userData.gridPosition = { x: nx, y: ny, z: nz };

            });

            // detach back to main group
            //active.forEach(c => mainGroup!.attach(c));


            console.log("maingroup:")
            console.log(mainGroup)
            dragRef.current.isMoving = false;
            return;
        }

        const delta = Math.min(speed, remaining);

        accumulated += delta * Math.sign(target);
        pivot.rotateOnAxis(axisVec, Math.sign(target) * delta);
        requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
    return;
};

const onMouseUp = (e: MouseEvent) => {
    const wasDragging = dragRef.current.isDragging;
    dragRef.current.isDragging = false;
    dragRef.current.dragEndPosition = { x: e.clientX, y: e.clientY };
    if (!wasDragging) return;

    if (dragRef.current.dragMode === 'face' && dragRef.current.clickedCube && dragRef.current.clickFace && !dragRef.current.isMoving) {
        const start = dragRef.current.dragStartPosition;
        const end = dragRef.current.dragEndPosition;
        console.log('Start:', start, 'End:', end);

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (false) {
            // click without meaningful drag -> ignore
            dragRef.current.clickedCube = null;
            dragRef.current.clickFace = null;
            return;
        }

        // compute world point for end mouse at the same distance as start click
        const rect = renderer.domElement.getBoundingClientRect();
        const ndcEnd = new THREE.Vector2(
            ((end.x - rect.left) / rect.width) * 2 - 1,
            -((end.y - rect.top) / rect.height) * 2 + 1
        );

        // get a world point along new ray at the same distance from camera as original click
        raycasterRef.current.setFromCamera(ndcEnd, camera);
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

        // Determine rotation axis based on clicked face and drag direction
        // The drag happens in a plane defined by the clicked face
        // We need to rotate around the axis perpendicular to both the face and drag direction
        let rotateAxis: 'x' | 'y' | 'z';

        if (face === 'x') {
            // Clicked X face, drag is in YZ plane
            rotateAxis = maxAxis === 'y' ? 'z' : 'y';
        } else if (face === 'y') {
            // Clicked Y face, drag is in XZ plane
            rotateAxis = maxAxis === 'x' ? 'z' : 'x';
        } else {
            // Clicked Z face, drag is in XY plane
            rotateAxis = maxAxis === 'x' ? 'y' : 'x';
        }

        // dir is already determined from screen coordinates above

        // perform rotation using the clicked cube's physical position
        if (dist > 50 && dragRef.current.clickedCube) {
            performRotation(rotateAxis, dragRef.current.clickedCube, dir);
        }
        dragRef.current.clickedCube = null;
        dragRef.current.clickFace = null;
    }
};

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