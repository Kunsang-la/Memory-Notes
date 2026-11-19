import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const COLORS = {
  background: '#F1F0E9',
  forest: '#29463A',
  border: '#DCDCD2',
  text: '#26352D',
  muted: '#777C72',
  white: '#FFFFFF',
  danger: '#A3332B',
};

type TrashedNote = {
  id: string;
  user_id: string;
  content?: string | null;
  images?: string[] | null;
  audio_track?: { title?: string; artist?: string } | null;
  created_at: string;
  deleted_at: string | null;
  tags?: string[] | null;
};

export default function TrashScreen({ navigation }: any) {
  const [notes, setNotes] = useState<TrashedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTrash = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again.');

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      setNotes((data || []) as TrashedNote[]);
    } catch (error: any) {
      Alert.alert('Could not load Trash', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadTrash(); }, [loadTrash]));

  const restoreNote = async (note: TrashedNote) => {
    setBusyId(note.id);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again.');
      const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: null })
        .eq('id', note.id)
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This memory could not be found or restored.');
      setNotes((current) => current.filter((item) => item.id !== note.id));
      Alert.alert('Memory restored', 'It is back in your home gallery.');
    } catch (error: any) {
      Alert.alert('Restore failed', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDelete = (note: TrashedNote) => {
    Alert.alert(
      'Delete permanently?',
      'This cannot be undone. Any image files stored separately in Supabase Storage may remain until they are cleaned up separately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(note.id);
              try {
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError) throw authError;
                if (!user) throw new Error('Please sign in again.');
                const { data, error } = await supabase
                  .from('notes')
                  .delete()
                  .eq('id', note.id)
                  .eq('user_id', user.id)
                  .not('deleted_at', 'is', null)
                  .select('id')
                  .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('This memory could not be found or deleted.');
                setNotes((current) => current.filter((item) => item.id !== note.id));
              } catch (error: any) {
                Alert.alert('Delete failed', error?.message || 'Please try again.');
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back to profile">
          <Ionicons name="arrow-back" size={23} color={COLORS.forest} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trash</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.intro}>Deleted memories stay here until you restore them or delete them permanently.</Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.forest} /></View>
      ) : notes.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTrash(); }} tintColor={COLORS.forest} />}
        >
          <View style={styles.emptyIcon}><Ionicons name="trash-outline" size={36} color={COLORS.forest} /></View>
          <Text style={styles.emptyTitle}>Trash is empty</Text>
          <Text style={styles.emptyText}>Memories you move to Trash from the home gallery will appear here.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTrash(); }} tintColor={COLORS.forest} />}
        >
          {notes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              {Array.isArray(note.images) && note.images[0] ? <Image source={{ uri: note.images[0] }} style={styles.thumbnail} /> : null}
              <View style={styles.noteBody}>
                <Text style={styles.noteContent} numberOfLines={4}>{note.content?.trim() || note.audio_track?.title || 'Memory without text'}</Text>
                {note.audio_track?.title ? <Text style={styles.musicText}><Ionicons name="musical-notes" size={13} color={COLORS.muted} /> {note.audio_track.title}{note.audio_track.artist ? ` · ${note.audio_track.artist}` : ''}</Text> : null}
                <Text style={styles.dateText}>Deleted {note.deleted_at ? new Date(note.deleted_at).toLocaleDateString() : 'recently'}</Text>
                {Array.isArray(note.tags) && note.tags.length > 0 ? <Text style={styles.tagsText}>{note.tags.map((tag) => `#${tag}`).join('  ')}</Text> : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.restoreButton} onPress={() => void restoreNote(note)} disabled={busyId === note.id} accessibilityRole="button">
                    {busyId === note.id ? <ActivityIndicator size="small" color={COLORS.white} /> : <><Ionicons name="refresh-outline" size={16} color={COLORS.white} /><Text style={styles.restoreText}>Restore</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => permanentlyDelete(note)} disabled={busyId === note.id} accessibilityRole="button">
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} /><Text style={styles.deleteText}>Delete forever</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 108, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerTitle: { position: 'absolute', left: 70, right: 70, top: 50, textAlign: 'center', fontSize: 22, fontWeight: '800', color: COLORS.forest },
  headerSpacer: { width: 40 },
  intro: { color: COLORS.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 36 },
  emptyIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: '#E7E9DF', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { color: COLORS.forest, fontSize: 21, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 290 },
  list: { padding: 18, paddingBottom: 36, gap: 13 },
  noteCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  thumbnail: { width: 82, height: 100, borderRadius: 12, backgroundColor: '#E7E9DF' },
  noteBody: { flex: 1, minWidth: 0 },
  noteContent: { color: COLORS.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  musicText: { color: COLORS.muted, fontSize: 12, marginTop: 6 },
  dateText: { color: COLORS.muted, fontSize: 11, marginTop: 7 },
  tagsText: { color: COLORS.forest, fontSize: 11, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  restoreButton: { minHeight: 36, borderRadius: 11, paddingHorizontal: 12, backgroundColor: COLORS.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  restoreText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  deleteButton: { minHeight: 36, borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#FCE8E6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deleteText: { color: COLORS.danger, fontSize: 12, fontWeight: '800' },
});
