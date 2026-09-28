// Branded products: none are specified for this flat yet, so the Products
// tab stays empty until the architect names them. Same interface as B-34's products.js.
export function createProducts() {
  return {
    GROUPS: [], DEFAULTS: {}, apply() {}, MP: {}, tileSwatch: {},
    roundChairPoses: (table, chairs) => chairs.map(p => ({ cx: p.obb.cx, cy: p.obb.cy, angle: p.obb.angle })),
    thumbPiece: () => null, tile: () => ({ map: null }),
  };
}
