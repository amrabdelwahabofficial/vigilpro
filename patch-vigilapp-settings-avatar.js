const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

content = content.replace(
  '<View style={[styles.avatar, { backgroundColor: palette.primary }]}><Text style={[styles.avatarText, { color: palette.primaryForeground }]}>{fullName.charAt(0).toUpperCase()}</Text></View>',
  '<Avatar />'
);

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
