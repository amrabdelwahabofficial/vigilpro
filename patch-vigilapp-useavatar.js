const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

// replace Header profile icon
content = content.replace(
  '<Ionicons name="person-outline" size={20} color={palette.foreground} />',
  '{profileImageUri ? <Avatar size={24} onPress={() => setProfileVisible(true)} /> : <Ionicons name="person-outline" size={20} color={palette.foreground} />}'
);

// add profileImageUri to useVigil() in Header
content = content.replace(
  "const { palette, t, countryCode, currency, morningReminder, eveningReminder, setMorningReminder, setEveningReminder } = useVigil();",
  "const { palette, t, countryCode, currency, morningReminder, eveningReminder, setMorningReminder, setEveningReminder, profileImageUri } = useVigil();"
);

// replace in profile sheet modal
content = content.replace(
  '<View style={[styles.avatar, { backgroundColor: palette.primary }]}><Text style={[styles.avatarText, { color: palette.primaryForeground }]}>{fullName.charAt(0).toUpperCase()}</Text></View>',
  '<Avatar />'
);

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
