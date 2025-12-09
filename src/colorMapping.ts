import * as THREE from 'three';

/**
index 0 (Right/+X)
index 1 (Left/-X)
index 2 (Top/+Y)
index 3 (Bottom/-Y)
index 4 (Front/+Z)
index 5 (Back/-Z)
 */

export const whiteOnTop = [ // U
    0xff6b00, // orange - index 0 (Right/+X)
    0xff0000, // red    - index 1 (Left/-X)
    0xffffff, // white  - index 2 (Top/+Y)
    0xffff00, // yellow - index 3 (Bottom/-Y)
    0x0000ff, // blue   - index 4 (Front/+Z)
    0x00ff00, // green  - index 5 (Back/-Z)
];

export const whiteOnBottom = [ // D
    0xff0000, // red 
    0xff6b00, // orange 
    0xffff00, // yellow 
    0xffffff, // white
    0x0000ff, // blue   
    0x00ff00, // green  
];

export const whiteOnRight = [ // F
    0xffffff, // white 
    0xffff00, // yellow
    0xff0000, // red
    0xff6b00, // orange
    0x0000ff, // blue  
    0x00ff00, // green 
];
// TODO
export const whiteOnLeft = [ // B
    0xffff00, // yellow
    0xffffff, // white 
    0xff6b00, // orange
    0xff0000, // red  
    0x0000ff, // blue  
    0x00ff00, // green 
];
/**
index 0 (Right/+X)
index 1 (Left/-X)
index 2 (Top/+Y)
index 3 (Bottom/-Y)
index 4 (Front/+Z)
index 5 (Back/-Z)
 */
export const whiteOnFront = [ // L
    0xff6b00, // orange
    0xff0000, // red   
    0x00ff00, // green 
    0x0000ff, // blue  
    0xffffff, // white 
    0xffff00, // yellow
];

export const whiteOnBack = [ // R
    0xff6b00, // orange - index 0 (Right/+X)
    0xff0000, // red    - index 1 (Left/-X)
    0x0000ff, // blue   - index 4 (Front/+Z)
    0x00ff00, // green  - index 5 (Back/-Z)
    0xffff00, // yellow - index 3 (Bottom/-Y)
    0xffffff, // white  - index 2 (Top/+Y)
];

export const colorPositions = [whiteOnTop, whiteOnBottom, whiteOnRight, whiteOnLeft, whiteOnFront, whiteOnBack]
export const faceForInitialColor = ['U', 'D', 'F', 'B', 'L', 'R']

export interface JsonCube {
    center: number[],
    co: number[],
    cp: number[],
    eo: number[],
    ep: number[]
};

export const COLOR_TO_INDEX: Record<number, number> = {
    0: 0xff6b00, // orange - index 0 (Right/+X)
    1: 0xff0000, // red    - index 1 (Left/-X)
    2: 0xffffff, // white  - index 2 (Top/+Y)
    3: 0xffff00, // yellow - index 3 (Bottom/-Y)
    4: 0x0000ff, // blue   - index 4 (Front/+Z)
    5: 0x00ff00, // green  - index 5 (Back/-Z)
}


/**
 * 
 * export const FACE_NORMALS = {
    U: new THREE.Vector3(0, 1, 0),
    D: new THREE.Vector3(0, -1, 0),

    R: new THREE.Vector3(1, 0, 0),
    L: new THREE.Vector3(-1, 0, 0),

    // FIX IS HERE ↓
    F: new THREE.Vector3(0, 0, 1),   // front is +Z
    B: new THREE.Vector3(0, 0, -1),   // back  is -Z
};
 */

export const FACE_NORMALS = {
    U: new THREE.Vector3(0, 1, 0),
    D: new THREE.Vector3(0, -1, 0),

    B: new THREE.Vector3(1, 0, 0),
    F: new THREE.Vector3(-1, 0, 0),

    // FIX IS HERE ↓
    L: new THREE.Vector3(0, 0, 1),   // front is +Z
    R: new THREE.Vector3(0, 0, -1),   // back  is -Z
};

// Map actual THREE colors → cube notation letters
export const COLOR_TO_LETTER: { [colorHex: string]: string } = {
    "ffffff": "U",   // white
    "ffff00": "D",   // yellow
    "ff0000": "F",   // red
    "ff6b00": "B",   // orange
    "0000ff": "L",   // blue
    "00ff00": "R",   // green
};

const MATERIAL_NORMALS = [
    new THREE.Vector3(1, 0, 0),  // +X right  → material[0]
    new THREE.Vector3(-1, 0, 0),  // -X left   → material[1]
    new THREE.Vector3(0, 1, 0),  // +Y up     → material[2]
    new THREE.Vector3(0, -1, 0),  // -Y down   → material[3]
    new THREE.Vector3(0, 0, 1),  // +Z front  → material[4]
    new THREE.Vector3(0, 0, -1),  // -Z back   → material[5]
];

export const getStickerLetter = (cubie: THREE.Mesh, faceWorldNormal: THREE.Vector3): string => {
    const worldMatrix = cubie.matrixWorld;

    let bestIndex = -1;
    let bestDot = -Infinity;

    for (let i = 0; i < 6; i++) {
        const localNormal = MATERIAL_NORMALS[i].clone().applyMatrix4(worldMatrix).sub(cubie.getWorldPosition(new THREE.Vector3()));
        localNormal.normalize();

        const dot = localNormal.dot(faceWorldNormal);
        if (dot > bestDot) {
            bestDot = dot;
            bestIndex = i;
        }
    }

    if (!Array.isArray(cubie.material)) {
        return "?";
    }

    const hex = cubie.material[bestIndex].color.getHexString();
    return COLOR_TO_LETTER[hex] ?? "?";
}
