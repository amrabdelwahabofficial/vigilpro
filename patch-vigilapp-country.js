const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

// replace horizontalChips for countries
const oldCountryChips = `<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>{countries.map((country) => <Pressable key={country.code} onPress={() => setCountry(country.code)} style={[styles.languageChip, { borderColor: countryCode === country.code ? palette.primary : palette.border, backgroundColor: countryCode === country.code ? palette.accent : palette.card }]}><Text style={[styles.languageText, { color: countryCode === country.code ? palette.primary : palette.foreground }]}>{country.name}</Text></Pressable>)}</ScrollView>`;
const newCountryPicker = `<CountryPicker value={countryCode} onChange={setCountry} disabled={!isPro} />`;

content = content.replace(oldCountryChips, newCountryPicker);

// remove the separate Display currency section
// find <SectionTitle title={isPro ? 'Display currency' : 'Display currency · Pro'} />
// and the ScrollView and the Text after it.
const currencyRegex = /<SectionTitle title=\{isPro \? 'Display currency' : 'Display currency · Pro'\} \/>\n\s*<ScrollView horizontal showsHorizontalScrollIndicator=\{false\} contentContainerStyle=\{styles\.horizontalChips\}>\{currencies\.map\(\(item\) => <Pressable key=\{item\} onPress=\{\(\) => setCurrency\(item\)\} style=\{\[styles\.currencyChip, \{ borderColor: currency === item \? palette\.primary : palette\.border, backgroundColor: currency === item \? palette\.accent : palette\.card \}\]\}><Text style=\{\[styles\.languageText, \{ color: currency === item \? palette\.primary : palette\.foreground \}\]\}>\{item\}<\/Text><\/Pressable>\)\}<\/ScrollView>\n\s*<Text style=\{\[styles\.helperText, \{ color: palette\.mutedForeground \}\]\}>\{isPro \? 'Live exchange rates are cached for offline use' : 'Choose one currency during setup. Change currency and use live exchange features with Vigil Pro.'\}\{isPro && ratesUpdatedAt \? \` • updated \$\{new Date\(ratesUpdatedAt\)\.toLocaleDateString\(\)\}\` : ''\}\.<\/Text>/;

content = content.replace(currencyRegex, '');

// Also import CountryPicker
if (!content.includes('CountryPicker')) {
  content = content.replace("import { useSubscription } from '@/context/SubscriptionContext';", "import { useSubscription } from '@/context/SubscriptionContext';\nimport { CountryPicker } from '@/components/CountryPicker';");
}

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
