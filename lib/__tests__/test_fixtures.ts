import { PackageMapping } from "..";

export const simpleMadgeConfigPath = "lib/__tests__/simpleMadgeTestData/PackageMap.json";
export const simpleMadgeDependenciesPath = "lib/__tests__/simpleMadgeTestData/selfMadge.json";

export function loadSimpleMadge() {
  const m = new PackageMapping();
  m.getPackageMap(simpleMadgeDependenciesPath, simpleMadgeConfigPath);
  return m;
}

