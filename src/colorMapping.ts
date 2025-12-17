import * as THREE from 'three';

export const colors = [ // U
    0xff6b00, // orange - index 0 (Right/+X)
    0xff0000, // red    - index 1 (Left/-X)
    0xffffff, // white  - index 2 (Top/+Y)
    0xffff00, // yellow - index 3 (Bottom/-Y)
    0x0000ff, // blue   - index 4 (Front/+Z)
    0x00ff00, // green  - index 5 (Back/-Z)
];

export const nameColorMap = [ // U
    { name: 'Orange', color: colors[0] }, // orange - index 0 (Right/+X)
    { name: 'Red', color: colors[1] }, // red    - index 1 (Left/-X)
    { name: 'White', color: colors[2] }, // white  - index 2 (Top/+Y)
    { name: 'Yellow', color: colors[3] }, // yellow - index 3 (Bottom/-Y)
    { name: 'Blue', color: colors[4] }, // blue   - index 4 (Front/+Z)
    { name: 'Green', color: colors[5] } // green  - index 5 (Back/-Z)
];

export const FACE_NORMALS = {
    U: new THREE.Vector3(0, 1, 0),
    D: new THREE.Vector3(0, -1, 0),

    B: new THREE.Vector3(1, 0, 0),
    F: new THREE.Vector3(-1, 0, 0),

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

export const getStickerLetter = (cubie: THREE.Mesh, faceWorldNormal: THREE.Vector3, face: string): string => {
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
