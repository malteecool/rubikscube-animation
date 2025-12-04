/**
index 0 (Right/+X)
index 1 (Left/-X)
index 2 (Top/+Y)
index 3 (Bottom/-Y)
index 4 (Front/+Z)
index 5 (Back/-Z)
 */

export const whiteOnTop = [
    0xff6b00, // orange - index 0 (Right/+X)
    0xff0000, // red    - index 1 (Left/-X)
    0xffffff, // white  - index 2 (Top/+Y)
    0xffff00, // yellow - index 3 (Bottom/-Y)
    0x0000ff, // blue   - index 4 (Front/+Z)
    0x00ff00, // green  - index 5 (Back/-Z)
];

export const whiteOnBottom = [
    0xff0000, // red 
    0xff6b00, // orange 
    0xffff00, // yellow 
    0xffffff, // white
    0x0000ff, // blue   
    0x00ff00, // green  
];

const whiteOnRight = [
    0xffffff, // white 
    0xffff00, // yellow
    0xff6b00, // orange
    0xff0000, // red
    0x0000ff, // blue  
    0x00ff00, // green 
];
// TODO
const whiteOnLeft = [
    0xffffff, // white 
    0xffff00, // yellow
    0xff0000, // red  
    0xff6b00, // orange
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
const whiteOnFront = [
    0xff6b00, // orange
    0xff0000, // red   
    0x00ff00, // green 
    0x0000ff, // blue  
    0xffffff, // white 
    0xffff00, // yellow


];

const whiteOnBack = [
    0xff6b00, // orange - index 0 (Right/+X)
    0xff0000, // red    - index 1 (Left/-X)
    0x0000ff, // blue   - index 4 (Front/+Z)
    0x00ff00, // green  - index 5 (Back/-Z)
    0xffff00, // yellow - index 3 (Bottom/-Y)
    0xffffff, // white  - index 2 (Top/+Y)
];

export enum Face {
  R = "R", // +X
  L = "L", // -X
  U = "U", // +Y
  D = "D", // -Y
  F = "F", // +Z
  B = "B"  // -Z
}

export const FACE_TO_INDEX: Record<Face, number> = {
    [Face.R]: 0,
    [Face.L]: 1,
    [Face.U]: 2,
    [Face.D]: 3,
    [Face.F]: 4,
    [Face.B]: 5,
};

export interface CubeColorConfig {
    [Face.R]: number;
    [Face.L]: number;
    [Face.U]: number;
    [Face.D]: number;
    [Face.F]: number;
    [Face.B]: number;
}

const defaultColors: CubeColorConfig = {
    R: 0xff6b00, // orange
    L: 0xff0000, // red
    U: 0xffffff, // white
    D: 0xffff00, // yellow
    F: 0x0000ff, // blue
    B: 0x00ff00, // green
};

export const CORNER_FACE_SETS: Record<string, Face[]> = {
    URF: [Face.U, Face.R, Face.F],
    UFL: [Face.U, Face.F, Face.L],
    ULB: [Face.U, Face.L, Face.B],
    UBR: [Face.U, Face.B, Face.R],

    DFR: [Face.D, Face.F, Face.R],
    DLF: [Face.D, Face.L, Face.F],
    DBL: [Face.D, Face.B, Face.L],
    DRB: [Face.D, Face.R, Face.B],
};

export const EDGE_FACE_SETS: Record<string, Face[]> = {
  UF: [Face.U, Face.F],
  UR: [Face.U, Face.R],
  UB: [Face.U, Face.B],
  UL: [Face.U, Face.L],

  DF: [Face.D, Face.F],
  DR: [Face.D, Face.R],
  DB: [Face.D, Face.B],
  DL: [Face.D, Face.L],

  FR: [Face.F, Face.R],
  FL: [Face.F, Face.L],
  BR: [Face.B, Face.R],
  BL: [Face.B, Face.L],
};

export const CENTER_FACE_SETS: Record<string, Face[]> = {
  U: [Face.U],
  D: [Face.D],
  F: [Face.F],
  B: [Face.B],
  R: [Face.R],
  L: [Face.L],
};

export default function ColorMap() {

}
