// screens/AuthScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { signInUser, signUpUser } from '../services/authService';
const COLORS = {
  background: '#F1F0E9', // Soft Stone
  forest: '#29463A',     // Forest Green
  border: '#DCDCD2',
  text: '#26352D',
  muted: '#777C72',
  input: '#FAFAF6',
  white: '#FFFFFF',
};

export default function AuthScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert('Missing details', 'Please enter both your email address and password.');
      return;
    }

    if (isSignUp) {
      if (!/^[a-zA-Z0-9_.]{3,20}$/.test(cleanUsername)) {
        Alert.alert(
          'Invalid username',
          'Choose a username with 3–20 characters using only letters, numbers, underscores, or periods.'
        );
        return;
      }

      if (password.length < 6) {
        Alert.alert('Password too short', 'Please use a password with at least 6 characters.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUpUser(cleanEmail, password, cleanUsername);
        Alert.alert(
          'Check your inbox',
          'Your account has been created. Check your email to verify your account.'
        );
      } else {
        await signInUser(cleanEmail, password);
      }
    } catch (error: any) {
      Alert.alert(
        'Authentication failed',
        error?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
    <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkIcon}>✳</Text>
          </View>

          <Text style={styles.eyebrow}>A LITTLE PLACE FOR YOUR MEMORIES</Text>
          <Text style={styles.appName}>Memory Notes</Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? 'Start collecting the moments you want to keep.'
              : 'Keep the moments that matter close.'}
          </Text>

          <View style={styles.card}>
            <Text style={styles.formTitle}>
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={styles.formSubtitle}>
              {isSignUp
                ? 'Choose a username for your memory journal.'
                : 'Sign in to return to your little memory journal.'}
            </Text>

            {isSignUp && (
              <>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <TextInput
                  placeholder="Choose a username"
                  placeholderTextColor="#9A9D94"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  maxLength={20}
                  style={styles.input}
                  accessibilityLabel="Username"
                  editable={!loading}
                  returnKeyType="next"
                />
                <Text style={styles.helperText}>
                  3–20 characters: letters, numbers, underscores, or periods.
                </Text>
              </>
            )}

            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
            <TextInput
              placeholder="Enter your mail"
              placeholderTextColor="#9A9D94"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              style={styles.input}
              accessibilityLabel="Email address"
              editable={!loading}
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.passwordInputRow}>
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor="#9A9D94"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textContentType={isSignUp ? 'newPassword' : 'password'}
                style={[styles.input, styles.passwordInput]}
                accessibilityLabel="Password"
                editable={!loading}
                onSubmitEditing={handleAuth}
                returnKeyType="go"
              />
              <TouchableOpacity
                style={styles.passwordVisibilityButton}
                onPress={() => setShowPassword((visible) => !visible)}
                disabled={loading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityHint="Toggles password visibility"
              >
                <Text style={styles.passwordVisibilityIcon}>
                  {showPassword ? '⊘' : '◉'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignUp ? 'Create account' : 'Sign in to your journal'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>A MOMENT JUST FOR YOU</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              onPress={() => {
                if (!loading) setIsSignUp((current) => !current);
              }}
              style={styles.toggleContainer}
              disabled={loading}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.togglePrompt}>
                {isSignUp ? 'Already have an account? ' : 'New to Memory Notes? '}
                <Text style={styles.toggleText}>
                  {isSignUp ? 'Sign in' : 'Create one'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            MADE FOR THE MOMENTS YOU WANT TO REMEMBER
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  content: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  brandMark: {
    alignSelf: 'center',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  brandMarkIcon: {
    color: COLORS.background,
    fontSize: 30,
    lineHeight: 34,
  },
  eyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.1,
    textAlign: 'center',
    marginBottom: 9,
  },
  appName: {
    color: COLORS.forest,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    shadowColor: COLORS.forest,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  formTitle: {
    color: COLORS.forest,
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },
  formSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 24,
  },
  fieldLabel: {
    color: COLORS.forest,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 15 : 12,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 19,
  },
  passwordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    marginBottom: 19,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
    marginBottom: 0,
  },
  passwordVisibilityButton: {
    minWidth: 38,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordVisibilityIcon: {
    color: COLORS.muted,
    fontSize: 21,
    fontWeight: '600',
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -12,
    marginBottom: 18,
    marginLeft: 2,
  },
  primaryButton: {
    backgroundColor: COLORS.forest,
    minHeight: 52,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 18,
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  togglePrompt: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  toggleText: {
    color: COLORS.forest,
    fontWeight: '800',
  },
  footer: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 15,
  },
});
