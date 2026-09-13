const fs = require('fs');
let content = fs.readFileSync('artifacts/vigil-spend/components/VigilApp.tsx', 'utf8');

// First, find a place to insert Avatar component, say before Header
const avatarComponent = `function Avatar({ size = 42, onPress }: { size?: number; onPress?: () => void }) {
  const { palette, profileImageUri, setProfileImageUri } = useVigil();
  const { user } = useUser();
  const fullName = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Vigil member';
  
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setProfileImageUri(result.assets[0].uri);
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <Pressable onPress={onPress || pickImage} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.primary, overflow: 'hidden' }]}>
      {profileImageUri ? (
        <Image source={{ uri: profileImageUri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={[styles.avatarText, { color: palette.primaryForeground, fontSize: size * 0.4 }]}>{fullName.charAt(0).toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

`;

content = content.replace("function Header({ screen, onReceipt }: { screen: Screen; onReceipt?: () => void }) {", avatarComponent + "function Header({ screen, onReceipt }: { screen: Screen; onReceipt?: () => void }) {");

fs.writeFileSync('artifacts/vigil-spend/components/VigilApp.tsx', content);
