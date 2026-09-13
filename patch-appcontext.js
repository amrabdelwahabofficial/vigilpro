const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/context/AppContext.tsx', 'utf8');

content = content.replace(
  "export type CurrencyCode = 'AED' | 'USD' | 'GBP' | 'EUR' | 'CZK' | 'CAD' | 'AUD' | 'SAR' | 'INR' | 'JPY' | 'CHF' | 'RUB';",
  "export type CurrencyCode = string;"
);

content = content.replace(
  "export type CountryCode = 'AE' | 'US' | 'GB' | 'DE' | 'CZ' | 'CA' | 'AU' | 'SA' | 'IN' | 'JP' | 'CH' | 'RU';",
  "export type CountryCode = string;"
);

content = content.replace(
  /export const countries:[^\]]+\];/,
  `import { countries as allCountries } from 'countries-list';\n\nconst KNOWN_TAXES: Record<string, number> = {\n  AE: 0,\n  US: 20,\n  GB: 20,\n  DE: 25,\n  CZ: 15,\n  CA: 20,\n  AU: 20,\n  SA: 0,\n  IN: 15,\n  JP: 20,\n  CH: 15,\n  RU: 13,\n};\n\nexport const countries = Object.entries(allCountries).map(([code, data]) => ({\n  code,\n  name: data.name,\n  currency: data.currency[0] || 'USD',\n  taxPercent: KNOWN_TAXES[code] || 0,\n})).sort((a, b) => a.name.localeCompare(b.name));`
);

fs.writeFileSync('artifacts/vigil-spend/context/AppContext.tsx', content);
