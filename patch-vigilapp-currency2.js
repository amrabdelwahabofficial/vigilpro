const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

content = content.replace(
  "  const setCurrency = (nextCurrency: CurrencyCode) => { if (!isPro) { onSubscribe(); return; } updateCurrency(nextCurrency); };\n",
  ""
);

content = content.replace(
  "const { palette, t, language, themeMode, countryCode, currency, morningReminder, eveningReminder, ratesUpdatedAt, setLanguage, setThemeMode, setCountry: updateCountry, setCurrency: updateCurrency, setMorningReminder, setEveningReminder, clearHistory, startOver } = useVigil();",
  "const { palette, t, language, themeMode, countryCode, currency, morningReminder, eveningReminder, ratesUpdatedAt, setLanguage, setThemeMode, setCountry: updateCountry, setMorningReminder, setEveningReminder, clearHistory, startOver } = useVigil();"
);

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
