// screens/ProfileSetupScreen.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

const COLORS = {
  background: '#F1F0E9',
  forest: '#29463A',
  border: '#DCDCD2',
  text: '#26352D',
  muted: '#777C72',
  white: '#FFFFFF',
  input: '#FAFAF6',
};

type Props = {
  navigation: any;
  onComplete: () => void;
};

export default function ProfileSetupScreen({ onComplete }: Props) {
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);

  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow photo library access to choose a profile picture, or skip this step for now.'
        );
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
        setSelectedImage(result.assets[0]);
      }
    } catch (error: any) {
      Alert.alert('Could not open photos', error?.message || 'Please try again.');
    }
  };

  const finishSetup = async (skipPhoto: boolean) => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert('Session expired', 'Please sign in again and retry.');
      return;
    }

    setLoading(true);

    try {
      let avatarPath: string | null = null;

      if (!skipPhoto && selectedImage) {
        if (!selectedImage.base64) {
          throw new Error('The selected image could not be read. Please choose it again.');
        }

        const mimeType = selectedImage.mimeType || 'image/jpeg';
        const extension =
          mimeType === 'image/png' ? 'png' :
          mimeType === 'image/webp' ? 'webp' : 'jpg';
        const filePath = `${user.id}/avatar-${Date.now()}.${extension}`;
        const fileBytes = decode(selectedImage.base64);

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, fileBytes, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) throw uploadError;
        avatarPath = filePath;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarPath,
          onboarding_completed: true,
        })
        .eq('id', user.id);

      if (profileError) {
        // Best-effort cleanup so a failed profile update doesn't leave an orphaned upload.
        if (avatarPath) {
          await supabase.storage.from('avatars').remove([avatarPath]);
        }
        throw profileError;
      }

      onComplete();
    } catch (error: any) {
      Alert.alert(
        'Could not finish profile setup',
        error?.message || 'Please try again. You can also skip the photo.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkIcon}>✳</Text>
        </View>

        <Text style={styles.eyebrow}>ONE LAST LITTLE THING</Text>
        <Text style={styles.title}>Make it yours.</Text>
        <Text style={styles.subtitle}>
          Add a profile photo so your memory journal feels like you. You can always change it later.
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Choose profile photo"
          style={styles.avatarButton}
          onPress={choosePhoto}
          disabled={loading}
          activeOpacity={0.85}
        >
          {selectedImage?.uri ? (
            <Image source={{ uri: selectedImage.uri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.defaultAvatar}>
              <Text style={styles.avatarHead}>●</Text>
              <View style={styles.avatarShoulders} />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Text style={styles.cameraBadgeText}>＋</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.photoLabel}>
          {selectedImage ? 'LOOKING GOOD' : 'YOUR PROFILE PHOTO'}
        </Text>
        <Text style={styles.helper}>
          {selectedImage ? 'Your photo is ready to save.' : 'Choose a photo from your gallery.'}
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={() => finishSetup(false)}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {selectedImage ? 'Save photo & continue' : 'Continue with default avatar'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => finishSetup(true)}
          disabled={loading}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>YOUR MEMORIES, YOUR LITTLE CORNER</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 24,
  },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  brandMarkIcon: {
    color: COLORS.background,
    fontSize: 28,
    lineHeight: 32,
  },
  eyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    color: COLORS.forest,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
    maxWidth: 310,
  },
  avatarButton: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  defaultAvatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#E2E4D9',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  avatarHead: {
    position: 'absolute',
    top: 23,
    color: COLORS.forest,
    fontSize: 47,
    lineHeight: 54,
  },
  avatarShoulders: {
    width: 91,
    height: 54,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    backgroundColor: COLORS.forest,
    marginBottom: -3,
  },
  avatarImage: {
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  cameraBadge: {
    position: 'absolute',
    right: -1,
    bottom: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.forest,
    borderWidth: 3,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadgeText: {
    color: COLORS.white,
    fontSize: 25,
    lineHeight: 27,
    fontWeight: '500',
    marginTop: -2,
  },
  photoLabel: {
    color: COLORS.forest,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  helper: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 28,
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: COLORS.forest,
    paddingHorizontal: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  skipButton: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    marginTop: 3,
  },
  skipText: {
    color: COLORS.forest,
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 28,
  },
});
