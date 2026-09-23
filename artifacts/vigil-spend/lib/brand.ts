export function standardizeVisibleBrand(text: string): string {
  return text
    .replaceAll('Vigil — Know Where It All Goes', 'Vigil Spend')
    .replaceAll('Vigil Know Where It All Goes', 'Vigil Spend')
    .replaceAll('Vigil-Pro', 'Vigil Spend Pro')
    .replaceAll('Vigil Pro', 'Vigil Spend Pro')
    .replace(/\bVIGIL\b/g, 'Vigil Spend')
    .replace(/\bVigil\b(?!\s+Spend)/g, 'Vigil Spend');
}

export function standardizeVisibleBrandCopy<T>(value: T): T {
  if (typeof value === 'string') return standardizeVisibleBrand(value) as T;
  if (Array.isArray(value)) return value.map((item) => standardizeVisibleBrandCopy(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, standardizeVisibleBrandCopy(item)]),
    ) as T;
  }
  return value;
}