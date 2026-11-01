// Standard per-egg values, so every list that mentions eggs agrees (USDA large egg is about 6.3 g protein, 72 cal).
// Pure (no React, no I/O).
export const EGG_PROTEIN_G = 6.3;       // one large whole egg (USDA)
export const EGG_CAL = 72;
export const EGG_WHITE_PROTEIN_G = 3.6; // one large egg white
export const eggsProtein = (n) => Math.round(Number(n) * EGG_PROTEIN_G);
