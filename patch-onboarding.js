const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/app/onboarding.tsx', 'utf8');

content = content.replace(
  "import { countries, CountryCode, useVigil } from '@/context/AppContext';",
  "import { CountryCode, useVigil } from '@/context/AppContext';\nimport { CountryPicker } from '@/components/CountryPicker';"
);

const oldGrid = `<View style={styles.countryGrid}>
            {countries.map((country) => (
              <Pressable key={country.code} onPress={() => { void Haptics.selectionAsync(); setCountry(country.code as CountryCode); }} style={({ pressed }) => [styles.countryChoice, { backgroundColor: countryCode === country.code ? palette.accent : palette.card, borderColor: countryCode === country.code ? palette.primary : palette.border }, pressed && styles.pressed]}>
                <Text style={[styles.countryName, { color: palette.foreground }]}>{country.name}</Text>
                 <Text style={[styles.countryMeta, { color: palette.mutedForeground }]}>{country.currency}{country.taxPercent > 0 ? \` • \${country.taxPercent}% \${t('taxGuide')}\` : \` • \${t('noTaxBucket')}\`}</Text>
              </Pressable>
            ))}
          </View>`;

const newGrid = `<View style={styles.countryGrid}>
            <CountryPicker value={countryCode} onChange={setCountry} />
          </View>`;

content = content.replace(oldGrid, newGrid);

fs.writeFileSync('artifacts/vigil-spend/app/onboarding.tsx', content);
