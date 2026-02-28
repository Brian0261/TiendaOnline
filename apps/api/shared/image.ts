import path from "path";

type SharedImageModule = {
  PLACEHOLDER_PRODUCT: string;
  normalizeImageUrl: (raw: unknown) => string;
};

function loadSharedImageModule(): SharedImageModule {
  const sharedPath = path.join(process.cwd(), "..", "..", "packages", "shared", "src", "image.js");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(sharedPath) as SharedImageModule;
}

const mod = loadSharedImageModule();

export const PLACEHOLDER_PRODUCT = mod.PLACEHOLDER_PRODUCT;
export const normalizeImageUrl = mod.normalizeImageUrl;

export {};
