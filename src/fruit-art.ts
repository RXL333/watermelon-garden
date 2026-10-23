export const FRUIT_ATLAS = { file: 'assets/fruit-atlas-v2.png', width: 1448, height: 1086 } as const;

// Trim boxes include the WHOLE silhouette, especially crowns and stems.
// Body origins/diameters align the round flesh with the physics circle.
// [atlas x, atlas y, square size, body origin x, body origin y, body diameter]
export const FRUIT_SPRITES = [
  [106, 125, 210, 105, 125, 172], [448, 119, 212, 106, 135, 158],
  [803, 127, 208, 104, 128, 166], [1156, 134, 200, 100, 119, 177],
  [111, 462, 198, 99, 100, 178], [456, 464, 196, 98, 98, 184],
  [806, 458, 198, 99, 114, 180], [1156, 456, 198, 99, 114, 182],
  [99, 761, 224, 112, 148, 148], [457, 785, 194, 97, 104, 170],
  [802, 776, 206, 103, 110, 182], [1154, 787, 194, 97, 97, 178],
] as const;
