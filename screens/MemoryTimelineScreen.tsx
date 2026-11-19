import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
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
import { getNoteImageSignedUrls } from '../services/storageService';
import { useAudioPlayer } from 'expo-audio';

const C = { background: '#F1F0E9', forest: '#29463A', border: '#DCDCD2', text: '#26352D', muted: '#777C72', white: '#FFFFFF', sage: '#E2E4D9' };
type Memory = { id: string; content?: string | null; images?: string[] | null; audio_track?: { title?: string; artist?: string; audioUrl?: string } | null; created_at: string; tags?: string[] | null; is_favorite?: boolean };
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const weekdayNames = ['S','M','T','W','T','F','S'];

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }

function TimelineMemoryDetail({ memory, onClose, onEdit }: { memory: Memory; onClose: () => void; onEdit: () => void }) {
  const player = useAudioPlayer(memory.audio_track?.audioUrl || '');
  const screenWidth = Dimensions.get('window').width;
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  React.useEffect(() => {
    let active = true;
    const loadImages = async () => {
      const references = Array.isArray(memory.images) ? memory.images : [];
      if (!references.length) {
        setImageUrls([]);
        setImagesLoading(false);
        return;
      }
      setImagesLoading(true);
      setImageLoadFailed(false);
      try {
        // Storage is private now, so resolve stored object paths and legacy URLs
        // into short-lived signed URLs before rendering them.
        const signedUrls = await getNoteImageSignedUrls(references);
        if (active) {
          setImageUrls(signedUrls);
          setImageLoadFailed(signedUrls.length === 0);
        }
      } catch (error) {
        console.warn('Could not load timeline memory photos:', error);
        if (active) { setImageUrls([]); setImageLoadFailed(true); }
      } finally {
        if (active) setImagesLoading(false);
      }
    };
    void loadImages();
    return () => { active = false; };
  }, [memory.id, memory.images]);

  React.useEffect(() => {
    if (memory.audio_track?.audioUrl) player.play();
  }, [memory.id, memory.audio_track?.audioUrl, player]);
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button"><Text style={detailStyles.back}>‹ Back</Text></TouchableOpacity>
          <Text style={detailStyles.heading}>Your Memory</Text>
          <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit this memory" style={detailStyles.edit}><Ionicons name="create-outline" size={21} color={C.forest} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={detailStyles.content} showsVerticalScrollIndicator={false}>
          {imagesLoading && <View style={detailStyles.imageMessage}><ActivityIndicator size="small" color={C.forest} /><Text style={detailStyles.imageMessageText}>Loading photos…</Text></View>}
          {!imagesLoading && imageUrls.length > 0 && <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={detailStyles.imageCarouselContent}>
            {imageUrls.map((uri, index) => <View key={`${uri}-${index}`} style={[detailStyles.imageFrame, { width: screenWidth - 40 }]}><Image source={{ uri }} style={{ width: screenWidth - 40, height: 320 }} resizeMode="contain" onError={() => setImageLoadFailed(true)} /></View>)}
          </ScrollView>}
          {!imagesLoading && imageLoadFailed && <View style={detailStyles.imageMessage}><Ionicons name="image-outline" size={24} color={C.muted} /><Text style={detailStyles.imageMessageText}>Photos could not be loaded. Please close this memory and try again.</Text></View>}
          {!!memory.content?.trim() && <View style={detailStyles.noteCard}><Text style={detailStyles.noteText}>{memory.content}</Text></View>}
          {memory.audio_track && <View style={detailStyles.musicCard}><View style={detailStyles.musicIcon}><Ionicons name="musical-notes" size={20} color={C.forest} /></View><View style={{ flex: 1 }}><Text style={detailStyles.musicTitle}>{memory.audio_track.title || 'Untitled track'}</Text><Text style={detailStyles.musicArtist}>{memory.audio_track.artist || 'Unknown artist'}</Text>{!memory.audio_track.audioUrl && <Text style={detailStyles.musicHint}>Track details saved with this memory</Text>}</View></View>}
          {!!memory.tags?.length && <View style={detailStyles.tags}>{memory.tags.map((tag) => <Text key={tag} style={detailStyles.tag}>#{tag}</Text>)}</View>}
          <Text style={detailStyles.timestamp}>Saved {new Date(memory.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 54, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { color: C.forest, fontSize: 16, fontWeight: '700', width: 66 }, heading: { color: C.forest, fontSize: 18, fontWeight: '800' }, edit: { width: 42, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.sage },
  content: { padding: 20, paddingBottom: 40 }, imageCarouselContent: { alignItems: 'center' }, imageMessage: { minHeight: 90, borderRadius: 16, backgroundColor: '#E7E5DC', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8, marginBottom: 8 }, imageMessageText: { color: C.muted, fontSize: 12, textAlign: 'center' }, imageFrame: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E5DC', borderRadius: 16, marginRight: 0, overflow: 'hidden' },
  noteCard: { backgroundColor: '#F9F8F3', borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20, marginTop: 18 }, noteText: { color: C.text, fontSize: 19, lineHeight: 29 },
  musicCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E2E4D9', borderRadius: 16, padding: 15, marginTop: 16 }, musicIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F8F7F2', alignItems: 'center', justifyContent: 'center' }, musicTitle: { color: C.forest, fontSize: 15, fontWeight: '800' }, musicArtist: { color: C.muted, fontSize: 12, marginTop: 3 }, musicHint: { color: C.muted, fontSize: 10, marginTop: 5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 16 }, tag: { color: C.forest, backgroundColor: '#E7E9DE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, fontSize: 11 }, timestamp: { color: C.muted, fontSize: 12, marginTop: 22, textAlign: 'center' },
});

export default function MemoryTimelineScreen({ navigation }: any) {
  const today = new Date();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(today));
  const [mode, setMode] = useState<'calendar' | 'timeline'>('calendar');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  const loadMemories = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again.');
      const { data, error } = await supabase.from('notes').select('id, content, images, audio_track, created_at, tags, is_favorite, deleted_at').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      setMemories((data || []) as Memory[]);
    } catch (e: any) {
      Alert.alert('Could not load timeline', e?.message || 'Please try again.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void loadMemories(); }, [loadMemories]));

  const memoriesByDate = useMemo(() => {
    const map = new Map<string, Memory[]>();
    memories.forEach((memory) => {
      const key = dateKey(new Date(memory.created_at));
      map.set(key, [...(map.get(key) || []), memory]);
    });
    return map;
  }, [memories]);

  const monthDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [visibleMonth]);

  const selectedMemories = memoriesByDate.get(selectedDate) || [];
  const onThisDay = useMemo(() => memories.filter((memory) => {
    const d = new Date(memory.created_at);
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() < today.getFullYear();
  }), [memories]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, Memory[]>();
    memories.forEach((memory) => {
      const d = new Date(memory.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      groups.set(key, [...(groups.get(key) || []), memory]);
    });
    return Array.from(groups.entries()).map(([key, items]) => ({ key, title: `${monthNames[Number(key.slice(5,7))-1]} ${key.slice(0,4)}`, items }));
  }, [memories]);

  const shiftMonth = (delta: number) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const jumpToday = () => { const now = new Date(); setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(dateKey(now)); setMode('calendar'); };

  const renderMemory = (memory: Memory) => (
    <TouchableOpacity key={memory.id} activeOpacity={0.82} onPress={() => setSelectedMemory(memory)} accessibilityRole="button" accessibilityLabel={`Open memory: ${memory.content?.trim() || memory.audio_track?.title || 'memory'}`}>
      <View style={styles.memoryCard}>
        <View style={styles.memoryCardTop}>
          <View style={styles.memoryIcon}><Ionicons name={memory.images?.length ? 'images-outline' : memory.audio_track ? 'musical-notes-outline' : 'document-text-outline'} size={18} color={C.forest} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.memoryDate}>{new Date(memory.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            <Text style={styles.memoryTitle} numberOfLines={3}>{memory.content?.trim() || (memory.images?.length ? 'Photo memory' : memory.audio_track?.title || 'Untitled memory')}</Text>
          </View>
          {memory.is_favorite ? <Ionicons name="heart" size={17} color={C.forest} /> : null}
        </View>
        <View style={styles.memoryMeta}>
          {!!memory.images?.length && <Text style={styles.metaText}>{memory.images.length} photo{memory.images.length === 1 ? '' : 's'}</Text>}
          {!!memory.audio_track?.title && <Text style={styles.metaText}>♫ {memory.audio_track.title}</Text>}
          {!!memory.tags?.length && <Text style={styles.metaText}>{memory.tags.slice(0, 3).map((tag) => `#${tag}`).join('  ')}</Text>}
        </View>
        <View style={styles.openMemoryHint}><Text style={styles.openMemoryHintText}>Tap to open</Text><Ionicons name="chevron-forward" size={14} color={C.muted} /></View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Back to home"><Ionicons name="arrow-back" size={23} color={C.forest} /></TouchableOpacity>
        <View style={styles.headerText}><Text style={styles.headerEyebrow}>YOUR MEMORIES</Text><Text style={styles.headerTitle}>Timeline</Text></View>
        <TouchableOpacity style={styles.todayButton} onPress={jumpToday}><Text style={styles.todayButtonText}>Today</Text></TouchableOpacity>
      </View>
      <View style={styles.modeRow}>
        <TouchableOpacity onPress={() => setMode('calendar')} style={[styles.modeButton, mode === 'calendar' && styles.modeButtonActive]}><Ionicons name="calendar-outline" size={17} color={mode === 'calendar' ? C.white : C.forest} /><Text style={[styles.modeText, mode === 'calendar' && styles.modeTextActive]}>Calendar</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('timeline')} style={[styles.modeButton, mode === 'timeline' && styles.modeButtonActive]}><Ionicons name="time-outline" size={17} color={mode === 'timeline' ? C.white : C.forest} /><Text style={[styles.modeText, mode === 'timeline' && styles.modeTextActive]}>By month</Text></TouchableOpacity>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={C.forest} /></View> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadMemories(); }} tintColor={C.forest} />}>
          {onThisDay.length > 0 && <View style={styles.onThisDay}>
            <View style={styles.onThisDayHead}><View style={styles.onThisDayIcon}><Ionicons name="sparkles-outline" size={19} color={C.forest} /></View><View style={{ flex: 1 }}><Text style={styles.sectionEyebrow}>A LITTLE TIME CAPSULE</Text><Text style={styles.onThisDayTitle}>On This Day</Text></View><Text style={styles.onThisDayCount}>{onThisDay.length}</Text></View>
            <Text style={styles.onThisDaySubtitle}>Memories you made on this date in previous years.</Text>
            {onThisDay.map(renderMemory)}
          </View>}
          {mode === 'calendar' ? <>
            <View style={styles.monthHeader}><TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthArrow}><Ionicons name="chevron-back" size={22} color={C.forest} /></TouchableOpacity><View style={{ alignItems: 'center' }}><Text style={styles.monthTitle}>{monthNames[visibleMonth.getMonth()]}</Text><Text style={styles.monthYear}>{visibleMonth.getFullYear()}</Text></View><TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthArrow}><Ionicons name="chevron-forward" size={22} color={C.forest} /></TouchableOpacity></View>
            <View style={styles.calendar}>
              {weekdayNames.map((day, i) => <Text key={`${day}-${i}`} style={styles.weekday}>{day}</Text>)}
              {monthDays.map((day, i) => {
                if (day === null) return <View key={`blank-${i}`} style={styles.dayCell} />;
                const key = dateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
                const hasMemories = (memoriesByDate.get(key) || []).length > 0;
                const selected = key === selectedDate;
                const isToday = key === dateKey(today);
                return <TouchableOpacity key={key} onPress={() => setSelectedDate(key)} style={[styles.dayCell, selected && styles.dayCellSelected]}><Text style={[styles.dayNumber, selected && styles.dayNumberSelected, isToday && !selected && styles.dayNumberToday]}>{day}</Text>{hasMemories && <View style={[styles.dayDot, selected && styles.dayDotSelected]} />}</TouchableOpacity>;
              })}
            </View>
            <View style={styles.daySectionHeader}><View><Text style={styles.sectionEyebrow}>SELECTED DAY</Text><Text style={styles.daySectionTitle}>{formatDate(`${selectedDate}T12:00:00`)}</Text></View><Text style={styles.dayCount}>{selectedMemories.length} {selectedMemories.length === 1 ? 'memory' : 'memories'}</Text></View>
            {selectedMemories.length ? selectedMemories.map(renderMemory) : <View style={styles.emptyDay}><Ionicons name="leaf-outline" size={26} color={C.forest} /><Text style={styles.emptyTitle}>No memories on this date</Text><Text style={styles.emptyText}>Choose a date marked with a dot to revisit a memory.</Text></View>}
          </> : <>
            <Text style={styles.sectionEyebrow}>YOUR MEMORY ARCHIVE</Text><Text style={styles.timelineIntro}>Browse your memories month by month, newest first.</Text>
            {timelineGroups.length ? timelineGroups.map((group) => <View key={group.key} style={styles.timelineGroup}><View style={styles.timelineGroupHeader}><View style={styles.timelineLine} /><View style={{ flex: 1 }}><Text style={styles.timelineMonth}>{group.title}</Text><Text style={styles.timelineCount}>{group.items.length} {group.items.length === 1 ? 'memory' : 'memories'}</Text></View></View>{group.items.map(renderMemory)}</View>) : <View style={styles.emptyDay}><Ionicons name="time-outline" size={26} color={C.forest} /><Text style={styles.emptyTitle}>Your timeline is waiting</Text><Text style={styles.emptyText}>Create a memory and it will appear here.</Text></View>}
          </>}
        </ScrollView>
      )}
      {selectedMemory && <TimelineMemoryDetail memory={selectedMemory} onClose={() => setSelectedMemory(null)} onEdit={() => { const note = selectedMemory; setSelectedMemory(null); navigation.navigate('CreateNote', { note }); }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 52, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.sage, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, marginLeft: 12 }, headerEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.6, color: C.muted }, headerTitle: { fontSize: 25, fontWeight: '800', color: C.forest, marginTop: 1 },
  todayButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: C.forest }, todayButtonText: { color: C.white, fontWeight: '800', fontSize: 12 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 14 }, modeButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: '#F8F7F2' }, modeButtonActive: { backgroundColor: C.forest, borderColor: C.forest }, modeText: { color: C.forest, fontWeight: '700', fontSize: 12 }, modeTextActive: { color: C.white },
  content: { padding: 18, paddingBottom: 40 },
  onThisDay: { backgroundColor: '#E7E9DE', borderColor: '#D5D9CB', borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 20 }, onThisDayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, onThisDayIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F7F6F0', alignItems: 'center', justifyContent: 'center' }, sectionEyebrow: { fontSize: 9, letterSpacing: 1.4, fontWeight: '800', color: C.muted, marginBottom: 4 }, onThisDayTitle: { fontSize: 22, color: C.forest, fontWeight: '800' }, onThisDayCount: { fontSize: 13, fontWeight: '800', color: C.forest, backgroundColor: '#F7F6F0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }, onThisDaySubtitle: { color: C.muted, fontSize: 12, marginTop: 10, marginBottom: 6 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 12 }, monthArrow: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' }, monthTitle: { color: C.forest, fontSize: 23, fontWeight: '800' }, monthYear: { color: C.muted, fontSize: 12, marginTop: 2 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F8F7F2', borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 6, marginBottom: 22 }, weekday: { width: `${100/7}%`, textAlign: 'center', color: C.muted, fontSize: 11, fontWeight: '800', paddingVertical: 8 }, dayCell: { width: `${100/7}%`, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, dayCellSelected: { backgroundColor: C.forest }, dayNumber: { fontSize: 13, color: C.text, fontWeight: '600' }, dayNumberSelected: { color: C.white, fontWeight: '800' }, dayNumberToday: { color: C.forest, fontWeight: '900', textDecorationLine: 'underline' }, dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#66836B', position: 'absolute', bottom: 4 }, dayDotSelected: { backgroundColor: C.white },
  daySectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }, daySectionTitle: { fontSize: 17, fontWeight: '800', color: C.forest }, dayCount: { color: C.muted, fontSize: 11, fontWeight: '700', paddingBottom: 2 },
  memoryCard: { backgroundColor: '#F9F8F3', borderRadius: 15, borderWidth: 1, borderColor: C.border, padding: 13, marginTop: 9 }, memoryCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, memoryIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: C.sage, alignItems: 'center', justifyContent: 'center' }, memoryDate: { color: C.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }, memoryTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }, memoryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }, openMemoryHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 9 }, openMemoryHintText: { color: C.muted, fontSize: 10, fontWeight: '600' }, metaText: { fontSize: 10, color: C.forest, backgroundColor: '#E7E9DE', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  emptyDay: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18, borderRadius: 18, backgroundColor: '#F8F7F2', borderWidth: 1, borderColor: C.border, marginTop: 6 }, emptyTitle: { color: C.forest, fontWeight: '800', fontSize: 15, marginTop: 9 }, emptyText: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 5, lineHeight: 18 },
  timelineIntro: { color: C.muted, fontSize: 12, marginBottom: 14, marginTop: 3 }, timelineGroup: { marginBottom: 18 }, timelineGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 3 }, timelineLine: { width: 4, height: 34, borderRadius: 2, backgroundColor: C.forest }, timelineMonth: { fontSize: 18, color: C.forest, fontWeight: '800' }, timelineCount: { fontSize: 10, color: C.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
