// screens/CreateNoteScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { searchMusic, Track } from '../services/musicService';
import { getNoteImageObjectPath, uploadNoteImage } from '../services/storageService';

const TAG_SUGGESTIONS = ['Travel', 'Family', 'Friends', 'College', 'Important', 'Everyday'];

type MemoryRecord = {
  id: string;
  content?: string | null;
  images?: string[] | null;
  audio_track?: Track | null;
  tags?: string[] | null;
  group_id?: string | null;
  [key: string]: any;
};

export default function CreateNoteScreen({ navigation, route }: any) {
  const groupJournalId = route?.params?.groupJournalId as string | undefined;
  const groupJournalTitle = route?.params?.groupJournalTitle as string | undefined;
  const editingNote: MemoryRecord | undefined = route?.params?.note || route?.params?.memory;
  const isEditing = Boolean(editingNote?.id);
  const draftKey = useMemo(
    () => `memorynotes:draft:${groupJournalId || 'private'}:${editingNote?.id || 'new'}`,
    [groupJournalId, editingNote?.id],
  );

  const [content, setContent] = useState(String(editingNote?.content || ''));
  const [localImages, setLocalImages] = useState<string[]>(Array.isArray(editingNote?.images) ? editingNote!.images! : []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(editingNote?.audio_track || null);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(Array.isArray(editingNote?.tags) ? editingNote!.tags! : []);
  const [loading, setLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const hasRestoredDraft = useRef(false);
  const formScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const musicInputFocused = useRef(false);

  const player = useAudioPlayer(selectedTrack?.audioUrl || '');

  // Keep the music search field and its results above the keyboard when searching.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (musicInputFocused.current) {
        setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 120);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (searchResults.length > 0 && musicInputFocused.current) {
      const timer = setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 180);
      return () => clearTimeout(timer);
    }
  }, [searchResults]);

  // Restore an unfinished draft for new memories. Existing memories start from their saved values.
  useEffect(() => {
    let active = true;
    const restoreDraft = async () => {
      try {
        if (!editingNote) {
          const raw = await AsyncStorage.getItem(draftKey);
          if (raw && active) {
            const draft = JSON.parse(raw);
            if (typeof draft.content === 'string') setContent(draft.content);
            if (Array.isArray(draft.images)) setLocalImages(draft.images);
            if (Array.isArray(draft.tags)) setTags(draft.tags);
            if (draft.selectedTrack) setSelectedTrack(draft.selectedTrack);
          }
        }
      } catch (e) {
        console.warn('Could not restore memory draft:', e);
      } finally {
        if (active) {
          hasRestoredDraft.current = true;
          setDraftReady(true);
        }
      }
    };
    restoreDraft();
    return () => { active = false; };
  }, [draftKey, editingNote]);

  // Save unfinished text/media metadata locally as the user writes. Images selected from the device
  // remain local URIs until the memory is saved; the draft is local to this device.
  useEffect(() => {
    if (!draftReady || !hasRestoredDraft.current || loading) return;
    const hasDraftContent = content.trim() || localImages.length || tags.length || selectedTrack;
    if (!hasDraftContent) {
      if (!editingNote) AsyncStorage.removeItem(draftKey).catch(() => undefined);
      setDraftSaved(false);
      return;
    }
    const timeout = setTimeout(() => {
      AsyncStorage.setItem(draftKey, JSON.stringify({ content, images: localImages, tags, selectedTrack, savedAt: new Date().toISOString() }))
        .then(() => setDraftSaved(true))
        .catch((e) => console.warn('Could not save memory draft:', e));
    }, 500);
    return () => clearTimeout(timeout);
  }, [content, localImages, tags, selectedTrack, draftKey, draftReady, loading, editingNote]);

  const pickImages = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos to attach images to your memory notes.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) setLocalImages((prev) => [...prev, ...result.assets.map((asset) => asset.uri)]);
  };

  const handleSearchMusic = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length <= 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchMusic(text);
      setSearchResults(results);
    } catch (error) {
      console.warn('Music search failed:', error);
      setSearchResults([]);
    }
  };

  const selectTrack = (track: Track) => {
    setSelectedTrack(track);
    setSearchResults([]);
    setSearchQuery('');
    if (player) {
      player.replace({ uri: track.audioUrl });
      player.play();
    }
  };

  const toggleTag = (tag: string) => {
    const normalized = tag.trim().replace(/^#/, '');
    if (!normalized) return;
    setTags((current) => current.some((item) => item.toLowerCase() === normalized.toLowerCase())
      ? current.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
      : [...current, normalized]);
  };

  const addCustomTag = () => {
    const candidates = tagInput.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean);
    if (candidates.length) {
      setTags((current) => {
        const next = [...current];
        for (const candidate of candidates) {
          if (!next.some((tag) => tag.toLowerCase() === candidate.toLowerCase())) next.push(candidate);
        }
        return next;
      });
      setTagInput('');
    }
  };

  const handleSaveNote = async () => {
    if (!content.trim() && localImages.length === 0 && !selectedTrack) {
      Alert.alert('Nothing to save yet', 'Write something, add a photo, or attach a song first.');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated.');
      if (player?.playing) player.pause();

      const uploadedImageUrls: string[] = [];
      for (const uri of localImages) {
        // Keep already-uploaded URLs when editing; only upload new local device files.
        if (/^https?:\/\//i.test(uri)) {
          uploadedImageUrls.push(getNoteImageObjectPath(uri));
        } else {
          const url = await uploadNoteImage(uri, user.id, groupJournalId || editingNote?.group_id || null);
          if (!url) throw new Error('One of the photos could not be uploaded. Please try again.');
          uploadedImageUrls.push(url);
        }
      }

      const notePayload: Record<string, any> = {
        content: content.trim(),
        images: uploadedImageUrls,
        audio_track: selectedTrack,
        tags,
      };

      let error: any = null;
      if (isEditing && editingNote) {
        notePayload.edited_at = new Date().toISOString();
        const table = groupJournalId || editingNote.group_id ? 'group_notes' : 'notes';
        const query = supabase.from(table).update(notePayload).eq('id', editingNote.id);
        const result = table === 'notes'
          ? await query.eq('user_id', user.id)
          : await query.eq('author_id', user.id);
        error = result.error;
      } else if (groupJournalId) {
        const result = await supabase.from('group_notes').insert({
          ...notePayload, group_id: groupJournalId, author_id: user.id,
        });
        error = result.error;
      } else {
        const result = await supabase.from('notes').insert({ ...notePayload, user_id: user.id });
        error = result.error;
      }
      if (error) throw error;

      // Notify the other group members after a new group memory is saved.
      // Notification delivery is best-effort: a push-service failure must not
      // undo a successfully saved memory.
      if (groupJournalId && !isEditing) {
        const { error: notificationError } = await supabase.functions.invoke(
          'send-group-notification',
          {
            body: {
              event: 'group_memory',
              groupId: groupJournalId,
              groupTitle: groupJournalTitle || 'Group journal',
            },
          },
        );

        if (notificationError) {
          console.warn('Group memory was saved, but its push notification could not be sent:', notificationError.message);
        }
      }

      await AsyncStorage.removeItem(draftKey).catch(() => undefined);
      Alert.alert('Success', isEditing ? 'Memory updated successfully.' : groupJournalId ? 'Shared memory added to the group journal.' : 'Memory saved successfully!');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error Saving Memory', error?.message || 'Something went wrong while saving this memory.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
    <View style={styles.container}>
      <ScrollView
        ref={formScrollRef}
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit this memory' : groupJournalId ? `New Memory · ${groupJournalTitle || 'Group Journal'}` : "What's on your mind?"}
        </Text>
        <TextInput
          placeholder="Write down your thoughts or details..."
          placeholderTextColor="#85877E"
          value={content}
          onChangeText={setContent}
          multiline
          style={styles.contentInput}
        />

        <Text style={styles.sectionHeader}>Organize with tags</Text>
        <Text style={styles.helperText}>Choose a category or add your own. Tags help you find this memory later.</Text>
        <View style={styles.tagWrap}>
          {TAG_SUGGESTIONS.map((tag) => {
            const selected = tags.some((item) => item.toLowerCase() === tag.toLowerCase());
            return (
              <TouchableOpacity key={tag} onPress={() => toggleTag(tag)} style={[styles.tagChip, selected && styles.tagChipSelected]}>
                <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{selected ? '✓ ' : '+ '}{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.customTagRow}>
          <TextInput
            placeholder="Custom tags, separated by commas"
            placeholderTextColor="#85877E"
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={addCustomTag}
            returnKeyType="done"
            style={styles.searchInput}
          />
          <TouchableOpacity style={styles.addTagButton} onPress={addCustomTag}>
            <Text style={styles.addTagButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {tags.filter((tag) => !TAG_SUGGESTIONS.some((suggestion) => suggestion.toLowerCase() === tag.toLowerCase())).length > 0 && (
          <View style={styles.tagWrap}>
            {tags.filter((tag) => !TAG_SUGGESTIONS.some((suggestion) => suggestion.toLowerCase() === tag.toLowerCase())).map((tag) => (
              <TouchableOpacity key={tag} onPress={() => toggleTag(tag)} style={styles.customTagChip}>
                <Text style={styles.tagText}>#{tag}  ×</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.actionButton} onPress={pickImages}>
          <Text style={styles.actionButtonText}>Add Photos</Text>
        </TouchableOpacity>
        {localImages.length > 0 && (
          <FlatList
            horizontal
            data={localImages}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item, index }) => (
              <View style={styles.thumbWrap}>
                <Image source={{ uri: item }} style={styles.thumbImage} />
                <TouchableOpacity onPress={() => setLocalImages((current) => current.filter((_, i) => i !== index))} style={styles.removePhotoButton}>
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            style={styles.horizontalList}
            showsHorizontalScrollIndicator={false}
          />
        )}

        <Text style={styles.sectionHeader}>Attach Music</Text>
        <TextInput
          placeholder="A song that feels like this moment..."
          placeholderTextColor="#85877E"
          value={searchQuery}
          onChangeText={handleSearchMusic}
          onFocus={() => { musicInputFocused.current = true; setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 250); }}
          onBlur={() => { musicInputFocused.current = false; }}
          style={styles.searchInput}
        />
        {searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            <ScrollView style={styles.searchResultsScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {searchResults.map((item) => (
                <TouchableOpacity key={item.id} onPress={() => selectTrack(item)} style={styles.trackRow}>
                  <Image source={{ uri: item.albumArtUrl }} style={styles.albumArt} />
                  <View style={styles.trackDetails}>
                    <Text style={styles.trackTitle}>{item.title}</Text>
                    <Text style={styles.trackArtist}>{item.artist}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {selectedTrack && (
          <View style={styles.selectedTrackCard}>
            <Text style={styles.selectedTrackText}>🎵 Attached: {selectedTrack.title} — {selectedTrack.artist}</Text>
            <TouchableOpacity onPress={() => setSelectedTrack(null)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.draftStatus}>{draftSaved && !isEditing ? 'Draft saved on this device' : 'Your unfinished writing is saved on this device automatically.'}</Text>
      </ScrollView>

      <View style={styles.footer}>
        {loading ? (
          <ActivityIndicator size="large" color="#29463A" style={styles.loader} />
        ) : (
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveNote}>
            <Text style={styles.saveButtonText}>{isEditing ? 'Save Changes' : 'Save Memory'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F1F0E9' },
  formScroll: { flex: 1 },
  formContent: { padding: 20, paddingBottom: 260 },
  footer: { backgroundColor: '#F1F0E9', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#DCDCD2' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#29463A', marginBottom: 16 },
  contentInput: { backgroundColor: '#FAFAF6', borderWidth: 1, borderColor: '#DCDCD2', borderRadius: 12, padding: 14, fontSize: 15, lineHeight: 23, color: '#29463A', minHeight: 120, textAlignVertical: 'top', marginBottom: 16 },
  actionButton: { backgroundColor: '#E2E4D9', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginTop: 10, marginBottom: 12 },
  actionButtonText: { fontSize: 15, fontWeight: '600', color: '#29463A' },
  horizontalList: { marginBottom: 16 },
  thumbWrap: { position: 'relative', marginRight: 10 },
  thumbImage: { width: 84, height: 84, borderRadius: 10 },
  removePhotoButton: { position: 'absolute', top: 3, right: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#29463A', alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: '#FFFFFF', fontSize: 18, lineHeight: 20, fontWeight: '700' },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#29463A', marginTop: 12, marginBottom: 6 },
  helperText: { fontSize: 12, lineHeight: 18, color: '#6F7469', marginBottom: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tagChip: { borderWidth: 1, borderColor: '#C9CEC0', backgroundColor: '#FAFAF6', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
  tagChipSelected: { backgroundColor: '#29463A', borderColor: '#29463A' },
  tagText: { color: '#29463A', fontSize: 12, fontWeight: '600' },
  tagTextSelected: { color: '#FFFFFF' },
  customTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#FAFAF6', borderWidth: 1, borderColor: '#DCDCD2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#29463A', marginBottom: 10 },
  addTagButton: { backgroundColor: '#E2E4D9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  addTagButtonText: { color: '#29463A', fontWeight: '700' },
  customTagChip: { backgroundColor: '#E2E4D9', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16 },
  selectedTrackCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E5E8DF', padding: 12, borderRadius: 10, marginBottom: 16 },
  selectedTrackText: { fontWeight: '600', color: '#29463A', flex: 1, marginRight: 8 },
  removeText: { color: '#8C4A43', fontWeight: '700', fontSize: 13 },
  searchResultsContainer: { height: 220, borderWidth: 1, borderColor: '#DCDCD2', borderRadius: 10, marginBottom: 16, overflow: 'hidden', backgroundColor: '#FAFAF6' },
  searchResultsScroll: { flex: 1 },
  trackRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 0.5, borderBottomColor: '#DCDCD2' },
  albumArt: { width: 42, height: 42, borderRadius: 6, marginRight: 12 },
  trackDetails: { flex: 1 },
  trackTitle: { fontSize: 14, fontWeight: '600', color: '#29463A' },
  trackArtist: { fontSize: 12, color: '#666', marginTop: 2 },
  draftStatus: { fontSize: 11, color: '#74786F', marginTop: 8, textAlign: 'center' },
  saveButton: { backgroundColor: '#29463A', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  loader: { marginVertical: 10 },
});
