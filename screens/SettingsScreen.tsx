// screens/SettingsScreen.tsx
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useFonts, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
const C = { bg: '#F1F0E9', green: '#29463A', border: '#DCDCD2', text: '#26352D', muted: '#777C72', white: '#FFFFFF', input: '#FAFAF6' };
type NoteFont = 'original' | 'caveat' | 'patrick-hand' | 'typewriter' | 'serif';
const FONT_OPTIONS: { key: NoteFont; title: string; description: string; family?: string; sample: string }[] = [
  { key: 'original', title: 'Original', description: 'Keep the current handwritten styles', sample: 'A little memory ♡' },
  { key: 'caveat', title: 'Caveat', description: 'Expressive, elegant handwriting', family: 'Caveat_700Bold', sample: 'A little memory ♡' },
  { key: 'patrick-hand', title: 'Patrick Hand', description: 'Friendly handwritten journal style', family: 'PatrickHand_400Regular', sample: 'A little memory ♡' },
  { key: 'typewriter', title: 'Typewriter', description: 'A nostalgic monospaced look', family: 'monospace', sample: 'A little memory ♡' },
  { key: 'serif', title: 'Classic Serif', description: 'A timeless, book-like style', family: 'serif', sample: 'A little memory ♡' },
];

export default function SettingsScreen({ navigation }: any) {
  const [selected, setSelected] = useState<NoteFont>('original');
  const [saved, setSaved] = useState<NoteFont>('original');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fontsLoaded] = useFonts({ Caveat_700Bold, PatrickHand_400Regular });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again.');
      const { data, error } = await supabase.from('profiles').select('note_font').eq('id', user.id).maybeSingle();
      if (error) throw error;
      const value = (FONT_OPTIONS.some((item) => item.key === data?.note_font) ? data?.note_font : 'original') as NoteFont;
      setSelected(value);
      setSaved(value);
    } catch (e: any) {
      Alert.alert('Could not load settings', e?.message || 'Please try again.');
    } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { void loadSettings(); }, []));

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('profiles').update({ note_font: selected }).eq('id', user.id);
      if (error) throw error;
      setSaved(selected);
      Alert.alert('Settings saved', 'Your note font has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not save settings', e?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  if (!fontsLoaded || loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.green} /></View>;

  return <View style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={23} color={C.green} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Settings</Text>
      <View style={styles.headerButton} />
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>NOTE CONTENT FONT</Text>
      <Text style={styles.intro}>Choose how the words inside your note cards look. This changes note content only — the app's headings, buttons, labels, and overall theme stay the same.</Text>
      <View style={styles.options}>
        {FONT_OPTIONS.map((option) => {
          const active = selected === option.key;
          return <TouchableOpacity key={option.key} onPress={() => setSelected(option.key)} activeOpacity={0.8}
            style={[styles.option, active && styles.optionActive]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <View style={styles.optionTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? C.green : C.muted} />
            </View>
            <View style={styles.preview}>
              <Text style={[styles.previewText, option.family ? { fontFamily: option.family } : (option.key === 'original' ? { fontFamily: 'PatrickHand_400Regular' } : undefined)]}>{option.sample}</Text>
              <Text style={styles.previewCaption}>Preview of note text</Text>
            </View>
          </TouchableOpacity>;
        })}
      </View>
      <TouchableOpacity style={[styles.saveButton, (saving || selected === saved) && styles.saveButtonDisabled]} onPress={() => void saveSettings()} disabled={saving || selected === saved} accessibilityRole="button">
        {saving ? <ActivityIndicator color={C.white} /> : <><Ionicons name="checkmark" size={20} color={C.white} /><Text style={styles.saveButtonText}>Save font preference</Text></>}
      </TouchableOpacity>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  header: { minHeight: 108, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { position: 'absolute', left: 60, right: 60, top: 50, textAlign: 'center', fontSize: 22, fontWeight: '800', color: C.green },
  content: { padding: 20, paddingBottom: 36 },
  sectionTitle: { color: C.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  intro: { color: C.muted, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  options: { gap: 12 },
  option: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 15 },
  optionActive: { borderColor: C.green, backgroundColor: '#F7F8F2', borderWidth: 2, padding: 14 },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  optionDescription: { color: C.muted, fontSize: 12, marginTop: 3 },
  preview: { backgroundColor: '#F1F0E9', borderRadius: 10, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10 },
  previewText: { color: '#354637', fontSize: 23, lineHeight: 30 },
  previewCaption: { color: C.muted, fontSize: 10, marginTop: 2 },
  saveButton: { minHeight: 52, borderRadius: 15, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22 },
  saveButtonDisabled: { opacity: 0.55 },
  saveButtonText: { color: C.white, fontSize: 14, fontWeight: '800' },
});
