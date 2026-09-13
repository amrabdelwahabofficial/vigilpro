const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

const target = `<Pressable testID="subscription-settings-link" onPress={() => { if (isPro) void presentCustomerCenter(); else onSubscribe(); }} style={({ pressed }) => pressStyle(pressed, styles.quietSubscriptionLink)}><Text style={[styles.quietSubscriptionText, { color: palette.mutedForeground }]}>{isPro ? t('manageSubscription') : t('proOptions')}</Text></Pressable>\n`;

content = content.replace(target, "");

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
