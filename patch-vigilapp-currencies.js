const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

content = content.replace(
  "  const currencies = Array.from(new Set(countries.map((country) => country.currency))) as CurrencyCode[];\n",
  ""
);

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
