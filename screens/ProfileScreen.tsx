// screens/ProfileScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { signOutUser } from '../services/authService';

const COLORS = {
  background: '#F1F0E9',
  forest: '#29463A',
  border: '#DCDCD2',
  text: '#26352D',
  muted: '#777C72',
  white: '#FFFFFF',
  input: '#FAFAF6',
};

type SelectedPhoto = ImagePicker.ImagePickerAsset;

export default function ProfileScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('Memory Keeper');
  const [draftUsername, setDraftUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;
      setEmail(user.email || '');

      const { data, error } = await supabase
        .from('profiles')
        .select('username, avatar_url, bio')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;

      const loadedUsername = data?.username || 'Memory Keeper';
      const loadedBio = data?.bio || '';
      setUsername(loadedUsername);
      setDraftUsername(loadedUsername);
      setBio(loadedBio);
      setDraftBio(loadedBio);
      setAvatarPath(data?.avatar_url || null);
      setSelectedPhoto(null);

      if (data?.avatar_url) {
        const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(data.avatar_url);
        setAvatarUrl(publicData.publicUrl);
      } else {
        setAvatarUrl(null);
      }
    } catch (error: any) {
      Alert.alert('Could not load profile', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { void loadProfile(); }, []));

  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo library access to update your profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setSelectedPhoto(result.assets[0]);
      }
    } catch (error: any) {
      Alert.alert('Could not open photos', error?.message || 'Please try again.');
    }
  };

  const cancelEditing = () => {
    setDraftUsername(username);
    setDraftBio(bio);
    setSelectedPhoto(null);
    setEditing(false);
  };

  const saveProfile = async () => {
    const cleanUsername = draftUsername.trim().replace(/^@+/, '');
    const cleanBio = draftBio.trim();

    if (cleanUsername.length < 2) {
      Alert.alert('Username too short', 'Your username must contain at least 2 characters.');
      return;
    }
    if (cleanUsername.length > 30 || !/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
      Alert.alert('Invalid username', 'Use 2–30 letters, numbers, underscores, or periods.');
      return;
    }
    if (cleanBio.length > 160) {
      Alert.alert('Bio too long', 'Keep your bio to 160 characters or fewer.');
      return;
    }

    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('Please sign in again.');

      let nextAvatarPath = avatarPath;
      if (selectedPhoto) {
        if (!selectedPhoto.base64) {
          throw new Error('The selected image could not be read. Please choose it again.');
        }
        const mimeType = selectedPhoto.mimeType || 'image/jpeg';
        const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
        uploadedPath = `${user.id}/avatar-${Date.now()}.${extension}`;
        const fileBytes = decode(selectedPhoto.base64);
        const { error: uploadError } = await supabase.storage.from('avatars').upload(uploadedPath, fileBytes, {
          contentType: mimeType,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        nextAvatarPath = uploadedPath;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: cleanUsername, bio: cleanBio || null, avatar_url: nextAvatarPath })
        .eq('id', user.id);

      if (updateError) {
        if (uploadedPath) await supabase.storage.from('avatars').remove([uploadedPath]);
        if (updateError.code === '23505') {
          throw new Error('That username is already taken. Please choose another one.');
        }
        throw updateError;
      }

      // Remove the previous avatar only after the profile update succeeds.
      if (selectedPhoto && avatarPath && avatarPath !== nextAvatarPath) {
        await supabase.storage.from('avatars').remove([avatarPath]);
      }

      setUsername(cleanUsername);
      setDraftUsername(cleanUsername);
      setBio(cleanBio);
      setDraftBio(cleanBio);
      setAvatarPath(nextAvatarPath);
      if (nextAvatarPath) {
        const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(nextAvatarPath);
        setAvatarUrl(`${publicData.publicUrl}${publicData.publicUrl.includes('?') ? '&' : '?'}t=${Date.now()}`);
      } else {
        setAvatarUrl(null);
      }
      setSelectedPhoto(null);
      setEditing(false);
      Alert.alert('Profile updated', 'Your profile changes have been saved.');
    } catch (error: any) {
      Alert.alert('Could not save profile', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const displayedAvatar = selectedPhoto?.uri || avatarUrl;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={23} color={COLORS.forest} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Profile</Text>
        {editing ? (
          <TouchableOpacity style={styles.headerAction} onPress={cancelEditing} disabled={saving} accessibilityRole="button">
            <Text style={styles.cancelText} numberOfLines={1} adjustsFontSizeToFit={false}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.headerAction} onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="create-outline" size={22} color={COLORS.forest} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.forest} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.profileCard}>
            <TouchableOpacity
              style={styles.avatarRing}
              onPress={editing ? choosePhoto : undefined}
              activeOpacity={editing ? 0.8 : 1}
              accessibilityRole={editing ? 'button' : undefined}
              accessibilityLabel={editing ? 'Change profile picture' : 'Profile picture'}
            >
              {displayedAvatar ? (
                <Image source={{ uri: displayedAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.defaultAvatar}><Ionicons name="person" size={58} color={COLORS.forest} /></View>
              )}
              {editing && <View style={styles.cameraBadge}><Ionicons name="camera" size={17} color={COLORS.white} /></View>}
            </TouchableOpacity>
            {editing && <Text style={styles.photoHint}>Tap your photo to change it</Text>}

            {editing ? (
              <View style={styles.editFields}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <View style={styles.usernameInputWrap}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    value={draftUsername}
                    onChangeText={setDraftUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    placeholder="your_username"
                    placeholderTextColor={COLORS.muted}
                    style={styles.usernameInput}
                  />
                </View>
                <Text style={styles.fieldLabel}>BIO</Text>
                <TextInput
                  value={draftBio}
                  onChangeText={setDraftBio}
                  multiline
                  maxLength={160}
                  placeholder="A little about you..."
                  placeholderTextColor={COLORS.muted}
                  style={styles.bioInput}
                  textAlignVertical="top"
                />
                <Text style={styles.characterCount}>{draftBio.length}/160</Text>
              </View>
            ) : (
              <>
                <Text style={styles.username}>{username}</Text>
                <Text style={styles.email}>{email}</Text>
                <Text style={styles.description}>{bio || 'Your little corner for the moments you want to keep.'}</Text>
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.infoCard, styles.trashCard]}
            onPress={() => navigation.navigate('Trash')}
            accessibilityRole="button"
            accessibilityLabel="Open Trash and restore deleted memories"
            activeOpacity={0.8}
          >
            <View style={styles.infoIcon}><Ionicons name="trash-outline" size={22} color={COLORS.forest} /></View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>Trash</Text>
              <Text style={styles.infoSubtitle}>Restore deleted memories or permanently remove them.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
          </TouchableOpacity>

          {editing ? (
            <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} onPress={() => void saveProfile()} disabled={saving} accessibilityRole="button">
              {saving ? <ActivityIndicator color={COLORS.white} /> : <><Ionicons name="checkmark" size={20} color={COLORS.white} /><Text style={styles.saveButtonText}>Save changes</Text></>}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.infoCard}
                onPress={() => navigation.navigate('Settings')}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                activeOpacity={0.8}
              >
                <View style={styles.infoIcon}><Ionicons name="settings-outline" size={22} color={COLORS.forest} /></View>
                <View style={styles.infoCopy}>
                  <Text style={styles.infoTitle}>Settings</Text>
                  <Text style={styles.infoSubtitle}>Choose the font style used for your note content.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signOutButton}
                onPress={() => Alert.alert('Sign out?', 'You can sign back in any time.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: () => { void signOutUser(); } },
                ])}
                accessibilityRole="button"
              >
                <Ionicons name="log-out-outline" size={20} color="#B3261E" />
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Match HomeScreen's header height and top inset so the title clears the selfie camera/status bar.
  header: {
    minHeight: 108,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerTitle: { position: 'absolute', left: 70, right: 70, top: 50, textAlign: 'center', fontSize: 22, fontWeight: '800', color: COLORS.forest },
  headerAction: { minWidth: 64, height: 40, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center', zIndex: 1 },
  cancelText: { color: COLORS.forest, fontSize: 13, fontWeight: '700', includeFontPadding: false, flexShrink: 0 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 22, paddingBottom: 40 },
  profileCard: { alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 28, marginBottom: 18 },
  avatarRing: { width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderColor: COLORS.border, padding: 4, marginBottom: 18, position: 'relative' },
  avatar: { width: '100%', height: '100%', borderRadius: 62 },
  defaultAvatar: { flex: 1, borderRadius: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E4D9' },
  cameraBadge: { position: 'absolute', right: 0, bottom: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.forest, borderWidth: 3, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  photoHint: { fontSize: 12, color: COLORS.muted, marginTop: -8, marginBottom: 16 },
  username: { fontSize: 25, fontWeight: '800', color: COLORS.forest },
  email: { fontSize: 13, color: COLORS.muted, marginTop: 6 },
  description: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: COLORS.text, marginTop: 18, maxWidth: 280 },
  editFields: { width: '100%', marginTop: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: COLORS.forest, marginBottom: 7, marginTop: 8 },
  usernameInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, paddingHorizontal: 13, marginBottom: 12 },
  atSign: { color: COLORS.muted, fontSize: 16, fontWeight: '700' },
  usernameInput: { flex: 1, minHeight: 46, paddingVertical: 10, paddingLeft: 5, color: COLORS.text, fontSize: 15 },
  bioInput: { minHeight: 100, maxHeight: 150, backgroundColor: COLORS.input, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: COLORS.text, fontSize: 14, lineHeight: 20 },
  characterCount: { textAlign: 'right', color: COLORS.muted, fontSize: 11, marginTop: 5 },
  saveButton: { minHeight: 52, borderRadius: 15, backgroundColor: COLORS.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 20 },
  disabledButton: { opacity: 0.7 },
  saveButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 16, marginBottom: 22 },
  trashCard: { marginTop: 2, marginBottom: 14 },
  infoIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E7E9DF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: COLORS.forest },
  infoSubtitle: { fontSize: 12, lineHeight: 18, color: COLORS.muted, marginTop: 4 },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 50, borderRadius: 14, backgroundColor: '#FCE8E6' },
  signOutText: { color: '#B3261E', fontSize: 14, fontWeight: '700' },
});
