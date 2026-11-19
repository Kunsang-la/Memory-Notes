
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Image,
  Dimensions,
  Animated,
  View,
  Text,
  TextInput,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useFonts, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';

import { supabase } from '../lib/supabase';
import { getNoteImageSignedUrls } from '../services/storageService';
import NoteCard from '../components/NoteCard';

const GROUP_LOGOS = [
  { key: 'people', label: 'People', icon: 'people', color: '#87947A' },
  { key: 'heart', label: 'Heart', icon: 'heart', color: '#D49B8B' },
  { key: 'beer', label: 'Beer Glass', icon: 'beer-outline', color: '#D6A044' },
  { key: 'leaf', label: 'Leaf', icon: 'leaf', color: '#87947A' },
  { key: 'paw', label: 'Paw', icon: 'paw', color: '#8299A8' },
  { key: 'sun', label: 'Sun', icon: 'sunny', color: '#E5B557' },
  { key: 'mountain', label: 'Mountain', icon: 'triangle', color: '#8299A8' },
  { key: 'palm', label: 'Palm Tree', icon: 'flower', color: '#D49B8B' },
  { key: 'coffee', label: 'Coffee', icon: 'cafe', color: '#987762' },
  { key: 'music', label: 'Music', icon: 'musical-notes', color: '#9589A5' },
] as const;

function getGroupLogo(key?: string | null) {
  return GROUP_LOGOS.find((logo) => logo.key === key) || GROUP_LOGOS[0];
}

type NoteFont = 'original' | 'caveat' | 'patrick-hand' | 'typewriter' | 'serif';

function getNoteFontFamily(font: NoteFont): string | undefined {
  switch (font) {
    case 'caveat': return 'Caveat_700Bold';
    case 'patrick-hand': return 'PatrickHand_400Regular';
    case 'typewriter': return 'monospace';
    case 'serif': return 'serif';
    default: return undefined;
  }
}

type Note = {
  id: string;
  user_id?: string;
  content?: string | null;
  images?: string[] | null;
  audio_track?: {
    title?: string;
    artist?: string;
    audioUrl?: string;
  } | null;
  created_at: string;
  tags?: string[] | null;
  is_favorite?: boolean;
  deleted_at?: string | null;
};

// Estimate each memory's visual height so cards are balanced into the shorter column.
function buildMasonryColumns<T extends { content?: string | null; images?: string[] | null; audio_track?: any }>(items: T[]) {
  const columns: T[][] = [[], []];
  const heights = [0, 0];
  items.forEach((item) => {
    const text = item.content?.trim() || '';
    const imageCount = Array.isArray(item.images) ? item.images.length : 0;
    const estimatedHeight = 105 + Math.min(180, Math.ceil(text.length / 34) * 17) + Math.min(imageCount, 2) * 118 + (item.audio_track ? 58 : 0);
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(item);
    heights[target] += estimatedHeight;
  });
  return columns;
}

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// --------------------------------------------------
// MEMORY DETAIL MODAL
// --------------------------------------------------

function MemoryDetailModal({
  note,
  onClose,
  onEdit,
  canEdit = true,
  contentFont = 'original',
}: {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
  canEdit?: boolean;
  contentFont?: NoteFont;
}) {
  const player = useAudioPlayer(note.audio_track?.audioUrl || '');
  const selectedContentFont = getNoteFontFamily(contentFont);
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    // Start the selected memory's track when the detail modal opens.
    // useAudioPlayer releases its player when this component unmounts, so
    // do not call pause() from cleanup after the native player is released.
    if (note.audio_track?.audioUrl) {
      player.play();
    }
  }, [note.id, note.audio_track?.audioUrl, player]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close memory"
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          <Text style={styles.detailHeading}>Your Memory</Text>

          {canEdit ? (
            <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit this memory" style={styles.editMemoryButton}>
              <Ionicons name="create-outline" size={20} color="#29463A" />
            </TouchableOpacity>
          ) : <View style={styles.editMemoryButton} />}
        </View>

        <ScrollView
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          {Array.isArray(note.images) && note.images.length > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
            >
              {note.images.map((uri, index) => (
                <View
                  key={`${uri}-${index}`}
                  style={styles.detailImageFrame}
                >
                  <Image
                    source={{ uri }}
                    style={{
                      width: screenWidth - 64,
                      height: 320,
                    }}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>
          )}

          {!!note.content?.trim() && (
            <View style={styles.detailNoteCard}>
              <Text style={[styles.detailNote, selectedContentFont ? { fontFamily: selectedContentFont } : undefined]}>{note.content}</Text>
            </View>
          )}

          {note.audio_track && (
            <View style={styles.detailMusicCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailMusicTitle}>
                  {note.audio_track.title || 'Untitled track'}
                </Text>

                <Text style={styles.detailMusicArtist}>
                  {note.audio_track.artist || 'Unknown artist'}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.detailTimestamp}>
            Saved{' '}
            {new Date(note.created_at).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// --------------------------------------------------
// HOME SCREEN
// --------------------------------------------------

export default function HomeScreen({ navigation }: any) {
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [noteFont, setNoteFont] = useState<NoteFont>('original');
  const [groupDrawerVisible, setGroupDrawerVisible] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [myGroupJournals, setMyGroupJournals] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [respondingInvitationId, setRespondingInvitationId] = useState<string | null>(null);
  const [allItemsModal, setAllItemsModal] = useState<'groups' | 'invitations' | null>(null);
  const [selectedInvitationDetails, setSelectedInvitationDetails] = useState<any | null>(null);
  const [invitationMembers, setInvitationMembers] = useState<any[]>([]);
  const [loadingInvitationMembers, setLoadingInvitationMembers] = useState(false);

  // Animate the Group Journals drawer horizontally from the right.
  const drawerWidth = Math.min(Dimensions.get('window').width * 0.86, 430);
  const drawerTranslateX = useRef(new Animated.Value(drawerWidth)).current;

  const closeGroupDrawer = () => {
    Animated.timing(drawerTranslateX, {
      toValue: drawerWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setGroupDrawerVisible(false);
    });
  };

  const openGroupDrawer = () => {
    drawerTranslateX.setValue(drawerWidth);
    setGroupDrawerVisible(true);
    loadPendingInvitations();
    loadMyGroupJournals();
  };

  const animateGroupDrawerIn = () => {
    drawerTranslateX.setValue(drawerWidth);
    Animated.spring(drawerTranslateX, {
      toValue: 0,
      damping: 24,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  };

  const loadMyGroupJournals = async () => {
    setLoadingGroups(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('group_journal_members')
        .select('group_id, group_journals(id, title, created_at, logo_key)')
        .eq('user_id', user.id);
      if (error) throw error;
      setMyGroupJournals((data || [])
        .map((row: any) => Array.isArray(row.group_journals) ? row.group_journals[0] : row.group_journals)
        .filter(Boolean));
    } catch (error: any) {
      console.error('Could not load group journals:', error.message);
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadPendingInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setPendingInvitations([]);
        return;
      }

      const { data, error } = await supabase
        .from('group_journal_invitations')
        .select('id, group_id, invited_by, created_at, group_journals(title)')
        .eq('invited_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const invitations = data || [];
      const inviterIds = [...new Set(invitations.map((item: any) => item.invited_by).filter(Boolean))];
      let profilesById: Record<string, any> = {};
      if (inviterIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', inviterIds);
        if (profilesError) throw profilesError;
        profilesById = Object.fromEntries((profiles || []).map((profile: any) => [profile.id, profile]));
      }

      setPendingInvitations(invitations.map((item: any) => ({
        ...item,
        group: Array.isArray(item.group_journals) ? item.group_journals[0] : item.group_journals,
        inviter: profilesById[item.invited_by] || null,
      })));
    } catch (error: any) {
      console.error('Could not load group invitations:', error.message);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const openInvitationDetails = async (invitation: any) => {
    setSelectedInvitationDetails(invitation);
    setInvitationMembers([]);
    setLoadingInvitationMembers(true);
    try {
      // This RPC securely allows the invited user to preview the current members
      // before joining, without granting general access to the membership table.
      const { data, error } = await supabase.rpc('get_group_journal_invitation_members', {
        invitation_id: invitation.id,
      });
      if (error) throw error;
      setInvitationMembers(data || []);
    } catch (error: any) {
      console.error('Could not load invitation members:', error?.message);
      Alert.alert(
        'Could not load members',
        'Please run the invitation member-preview SQL setup, then try again.',
      );
    } finally {
      setLoadingInvitationMembers(false);
    }
  };

  const respondToInvitation = async (invitation: any, accept: boolean) => {
    setRespondingInvitationId(invitation.id);
    try {
      const functionName = accept
        ? 'accept_group_journal_invitation'
        : 'decline_group_journal_invitation';
      const { data, error } = await supabase.rpc(functionName, {
        invitation_id: invitation.id,
      });
      if (error) throw error;

      setPendingInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setSelectedInvitationDetails((current: any) => current?.id === invitation.id ? null : current);
      if (allItemsModal === 'invitations') setAllItemsModal(null);
      if (accept) {
        await loadMyGroupJournals();
        Alert.alert(
          'Invitation accepted',
          `You have joined "${invitation.group?.title || 'the group journal'}".`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Open journal',
              onPress: () => {
                closeGroupDrawer();
                navigation.navigate('GroupJournalDetail', {
                  groupId: data || invitation.group_id,
                  title: invitation.group?.title || 'Group journal',
                });
              },
            },
          ],
        );
      } else {
        Alert.alert('Invitation declined', 'You have declined this group journal invitation.');
      }
    } catch (error: any) {
      Alert.alert(
        accept ? 'Could not accept invitation' : 'Could not decline invitation',
        error?.message || 'Please try again.',
      );
      // Refresh in case the invitation status changed elsewhere.
      loadPendingInvitations();
    } finally {
      setRespondingInvitationId(null);
    }
  };

  const searchUsers = async (text: string) => {
    setUserSearch(text);
    if (text.trim().length < 2) {
      setUserResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${text.trim()}%`)
        .neq('id', user?.id || '')
        .order('username', { ascending: true }).limit(20);
      if (error) throw error;
      setUserResults(data || []);
    } catch (error: any) {
      Alert.alert('User search failed', error.message || 'Please try again.');
    } finally {
      setSearchingUsers(false);
    }
  };

  const toggleSelectedUser = (person: any) => {
    setSelectedUsers((current) => current.some((item) => item.id === person.id)
      ? current.filter((item) => item.id !== person.id)
      : [...current, person]);
  };

  const createGroupJournal = async () => {
    if (!selectedUsers.length) {
      Alert.alert('Invite someone first', 'Search for and select at least one person to invite.');
      return;
    }
    if (!groupTitle.trim()) {
      Alert.alert('Name your journal', 'Enter a name for your group journal.');
      return;
    }

    setCreatingGroup(true);
    let createdGroupId: string | null = null;

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in again.');

      const { data: group, error: groupError } = await supabase
        .from('group_journals')
        .insert({ title: groupTitle.trim(), owner_id: user.id })
        .select('id, title')
        .single();

      if (groupError) throw groupError;
      if (!group) throw new Error('The group journal could not be created.');
      createdGroupId = group.id;

      // Add only the creator as the initial owner. Other users must accept
      // an invitation before they receive a membership row.
      const { error: ownerMembershipError } = await supabase
        .from('group_journal_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: 'owner',
        });

      if (ownerMembershipError) throw ownerMembershipError;

      const invitationRows = selectedUsers.map((person) => ({
        group_id: group.id,
        invited_user_id: person.id,
        invited_by: user.id,
        status: 'pending',
        responded_at: null,
      }));

      const { error: invitationsError } = await supabase
        .from('group_journal_invitations')
        .insert(invitationRows);

      if (invitationsError) throw invitationsError;

      closeGroupDrawer();
      setUserSearch('');
      setUserResults([]);
      setSelectedUsers([]);
      setGroupTitle('');

      await loadMyGroupJournals();
      navigation.navigate('GroupJournalDetail', {
        groupId: group.id,
        title: group.title,
      });

      Alert.alert(
        'Invitations sent',
        `Your journal is ready. ${selectedUsers.length} invitation${selectedUsers.length === 1 ? '' : 's'} ${selectedUsers.length === 1 ? 'was' : 'were'} created. People join only after accepting.`,
      );
    } catch (error: any) {
      // Clean up the partially created journal if membership or invitation
      // creation fails. The owner-delete policy cascades related rows.
      if (createdGroupId) {
        const { error: cleanupError } = await supabase
          .from('group_journals')
          .delete()
          .eq('id', createdGroupId);

        if (cleanupError) {
          console.error('Could not clean up partially created group:', cleanupError.message);
        }
      }

      Alert.alert(
        'Could not create group journal',
        error?.message || 'Please try again.',
      );
    } finally {
      setCreatingGroup(false);
    }
  };

  const fetchProfileAvatar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfileAvatarUrl(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url, note_font')
      .eq('id', user.id)
      .maybeSingle();

    const savedFont = data?.note_font;
    setNoteFont(savedFont === 'caveat' || savedFont === 'patrick-hand' || savedFont === 'typewriter' || savedFont === 'serif' ? savedFont : 'original');

    if (data?.avatar_url) {
      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(data.avatar_url);
      setProfileAvatarUrl(publicData.publicUrl);
    } else {
      setProfileAvatarUrl(null);
    }
  };

  // Load fonts here so both the grid and modal can use them.
  const [fontsLoaded] = useFonts({
    Caveat_700Bold,
    PatrickHand_400Regular,
  });

  const [notes, setNotes] = useState<Note[]>([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'favorites' | 'this-month' | 'older'>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const showTrash = false; // Trash browsing now lives on the Profile screen.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [activeMusicNoteId, setActiveMusicNoteId] = useState<string | null>(null);
  const homeMusicPlayer = useAudioPlayer('');

  const [trashBounds, setTrashBounds] = useState<Bounds>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const trashRef = useRef<React.ComponentRef<typeof View>>(null);

  // Fetch notes from Supabase.
  const fetchNotes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const rows = (data || []) as Note[];
      const rowsWithSignedImages = await Promise.all(rows.map(async (note) => ({
        ...note,
        images: await getNoteImageSignedUrls(note.images),
      })));
      setNotes(rowsWithSignedImages);
    } catch (error: any) {
      console.error('Error fetching notes:', error.message);
      Alert.alert('Unable to load memories', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload memories whenever this screen becomes active.
  useFocusEffect(
    useCallback(() => {
      fetchNotes();
      fetchProfileAvatar();
      loadMyGroupJournals();
      loadPendingInvitations();
    }, [fetchNotes])
  );

  // Measure the trash target in screen coordinates.
  const measureTrashTarget = useCallback(() => {
    requestAnimationFrame(() => {
      trashRef.current?.measureInWindow((x, y, width, height) => {
        setTrashBounds({ x, y, width, height });
      });
    });
  }, []);

  useEffect(() => {
    measureTrashTarget();
  }, [measureTrashTarget]);

  // Move a private memory to Trash instead of permanently deleting it.
  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('You must be signed in to move a memory to Trash.');

      const deletedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: deletedAt })
        .eq('id', noteId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .select('id, deleted_at')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Alert.alert('Memory not moved', 'The memory could not be found or you do not have permission to move it.');
        return;
      }

      setNotes((current) => current.map((note) => note.id === noteId ? { ...note, deleted_at: deletedAt } : note));
      setSelectedNote((current) => current?.id === noteId ? null : current);
      Alert.alert('Moved to Trash', 'You can restore this memory from Trash.');
    } catch (error: any) {
      console.error('Error moving memory to Trash:', error.message);
      Alert.alert('Could not move memory', error.message || 'Please try again.');
    }
  }, []);

  const handleRestoreNote = useCallback(async (noteId: string) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('You must be signed in to restore a memory.');

      const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: null })
        .eq('id', noteId)
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The memory could not be found or you do not have permission to restore it.');

      setNotes((current) => current.map((note) => note.id === noteId ? { ...note, deleted_at: null } : note));
      Alert.alert('Memory restored', 'The memory is back in your private gallery.');
    } catch (error: any) {
      Alert.alert('Restore failed', error.message || 'Please try again.');
    }
  }, []);

  const handlePermanentDelete = useCallback((noteId: string) => {
    Alert.alert(
      'Delete permanently?',
      'This removes the memory record permanently. This action cannot be undone. Any separately stored image files may need to be removed from Supabase Storage separately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError) throw authError;
                if (!user) throw new Error('You must be signed in to delete a memory.');
                const { data, error } = await supabase
                  .from('notes')
                  .delete()
                  .eq('id', noteId)
                  .eq('user_id', user.id)
                  .not('deleted_at', 'is', null)
                  .select('id')
                  .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('The memory could not be found or you do not have permission to delete it.');
                setNotes((current) => current.filter((note) => note.id !== noteId));
                setSelectedNote((current) => current?.id === noteId ? null : current);
                Alert.alert('Permanently deleted', 'The memory record has been deleted.');
              } catch (error: any) {
                Alert.alert('Delete failed', error.message || 'Please try again.');
              }
            })();
          },
        },
      ]
    );
  }, []);

  const activeNotes = notes.filter((note) => !note.deleted_at);
  const trashedNotes = notes.filter((note) => Boolean(note.deleted_at));
  const galleryNotes = showTrash ? trashedNotes : activeNotes;

  const availableTags = Array.from(new Set(activeNotes.flatMap((note) => note.tags || [])))
    .filter((tag) => Boolean(tag?.trim()))
    .sort((a, b) => a.localeCompare(b));

  const filteredNotes = galleryNotes.filter((note) => {
    const query = memorySearch.trim().toLowerCase();
    const searchableText = [note.content || '', note.audio_track?.title || '', note.audio_track?.artist || '', ...(note.tags || [])]
      .join(' ')
      .toLowerCase();
    if (query && !searchableText.includes(query)) return false;
    if (!showTrash && memoryFilter === 'favorites' && !note.is_favorite) return false;
    const created = new Date(note.created_at);
    const now = new Date();
    if (!showTrash && memoryFilter === 'this-month' && (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear())) return false;
    if (!showTrash && memoryFilter === 'older' && created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()) return false;
    if (!showTrash && activeTag && !(note.tags || []).includes(activeTag)) return false;
    return true;
  });

  const toggleFavorite = useCallback(async (note: Note) => {
    const nextValue = !note.is_favorite;
    setNotes((current) => current.map((item) => item.id === note.id ? { ...item, is_favorite: nextValue } : item));
    const { error } = await supabase.from('notes').update({ is_favorite: nextValue }).eq('id', note.id);
    if (error) {
      setNotes((current) => current.map((item) => item.id === note.id ? { ...item, is_favorite: !nextValue } : item));
      Alert.alert('Could not update favorite', error.message || 'Please try again.');
    }
  }, []);

  // Pull-to-refresh handler.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotes();
  }, [fetchNotes]);

  // Play/pause music from a home-screen card using one shared player.
  // Switching cards replaces the current track, so two home tracks cannot overlap.
  const toggleCardMusic = useCallback(
    (note: Note) => {
      const audioUrl = note.audio_track?.audioUrl;
      if (!audioUrl) return;

      if (activeMusicNoteId === note.id) {
        homeMusicPlayer.pause();
        setActiveMusicNoteId(null);
        return;
      }

      try {
        homeMusicPlayer.pause();
        homeMusicPlayer.replace(audioUrl);
        homeMusicPlayer.play();
        setActiveMusicNoteId(note.id);
      } catch (error) {
        console.error('Unable to play memory music:', error);
        setActiveMusicNoteId(null);
        Alert.alert('Unable to play music', 'This track could not be played.');
      }
    },
    [activeMusicNoteId, homeMusicPlayer]
  );

  // Stop home-screen playback before opening the memory detail.
  const openMemoryDetail = useCallback(
    (note: Note) => {
      homeMusicPlayer.pause();
      setActiveMusicNoteId(null);
      setSelectedNote(note);
    },
    [homeMusicPlayer]
  );

  // Check whether the released finger is inside the trash target.
  const handleDragEnd = useCallback(
    (noteId: string, absoluteX: number, absoluteY: number) => {
      // Give the drop target a generous invisible catch area above the visible tray,
      // so users do not have to drag all the way to the bottom edge of the screen.
      const dropPaddingX = 56;
      const dropPaddingTop = 190;
      const dropPaddingBottom = 24;
      const insideTrash =
        absoluteX >= trashBounds.x - dropPaddingX &&
        absoluteX <= trashBounds.x + trashBounds.width + dropPaddingX &&
        absoluteY >= trashBounds.y - dropPaddingTop &&
        absoluteY <= trashBounds.y + trashBounds.height + dropPaddingBottom;

      setDraggingNoteId(null);

      if (insideTrash) {
        void handleDeleteNote(noteId);
      }
    },
    [trashBounds, handleDeleteNote]
  );

  if (!fontsLoaded) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#29463A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header: profile on the left, centered title, sign out on the right */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          style={styles.profileHeaderBtn}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          hitSlop={8}
        >
          {profileAvatarUrl ? (
            <Image source={{ uri: profileAvatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerDefaultAvatar}>
              <Ionicons name="person" size={21} color="#29463A" />
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Memory Notes</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate('MemoryTimeline')}
            style={styles.groupJournalBtn}
            accessibilityRole="button"
            accessibilityLabel="Open memory timeline and calendar"
            hitSlop={8}
          >
            <Ionicons name="calendar-outline" size={22} color="#29463A" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openGroupDrawer}
            style={styles.groupJournalBtn}
            accessibilityRole="button"
            accessibilityLabel="Open group journals and search users"
            hitSlop={8}
          >
            <Ionicons name="book-outline" size={23} color="#29463A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Memory search and quick filters */}
      <View style={styles.memoryTools}>
        <View style={styles.memorySearchBox}>
          <Ionicons name="search-outline" size={19} color="#667267" />
          <TextInput
            value={memorySearch}
            onChangeText={setMemorySearch}
            placeholder="Search your memories, music, or tags..."
            placeholderTextColor="#858A80"
            style={styles.memorySearchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!memorySearch && <TouchableOpacity onPress={() => setMemorySearch('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color="#858A80" /></TouchableOpacity>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {([
            ['all', 'All memories'],
            ['favorites', '♥ Favorites'],
            ['this-month', 'This month'],
            ['older', 'Earlier'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity key={value} style={[styles.filterChip, memoryFilter === value && styles.filterChipActive]} onPress={() => setMemoryFilter(value)}>
              <Text style={[styles.filterChipText, memoryFilter === value && styles.filterChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}

        </ScrollView>
        {!showTrash && availableTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity style={[styles.tagChip, activeTag === null && styles.tagChipActive]} onPress={() => setActiveTag(null)}>
              <Text style={[styles.tagChipText, activeTag === null && styles.tagChipTextActive]}>All tags</Text>
            </TouchableOpacity>
            {availableTags.map((tag) => (
              <TouchableOpacity key={tag} style={[styles.tagChip, activeTag === tag && styles.tagChipActive]} onPress={() => setActiveTag(activeTag === tag ? null : tag)}>
                <Text style={[styles.tagChipText, activeTag === tag && styles.tagChipTextActive]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Memory list */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#29463A" />
          <Text style={styles.loadingText}>Loading your memories...</Text>
        </View>
      ) : galleryNotes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyDecoration}>{showTrash ? '♧' : '✳'}</Text>
          <Text style={styles.emptyTitle}>{showTrash ? 'Trash is empty' : 'No Memories Yet'}</Text>
          <Text style={styles.emptySubtitle}>
            {showTrash ? 'Memories you move to Trash will appear here. You can restore them or delete them permanently.' : "Tap the '+' button below to capture your first memory with photos and music."}
          </Text>
        </View>
      ) : filteredNotes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyDecoration}>⌕</Text>
          <Text style={styles.emptyTitle}>No matching memories</Text>
          <Text style={styles.emptySubtitle}>{showTrash ? 'No trashed memories match your search.' : 'Try another search, filter, or tag.'}</Text>
          <TouchableOpacity onPress={() => { setMemorySearch(''); setMemoryFilter('all'); setActiveTag(null); }} style={styles.clearFiltersButton}>
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#29463A']}
              tintColor="#29463A"
            />
          }
          // Keep both columns in one scroll container so cards can have independent heights.
          onLayout={measureTrashTarget}
          onContentSizeChange={measureTrashTarget}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.gridRow}>
            {buildMasonryColumns(filteredNotes).map((columnNotes, columnIndex) => (
              <View
                key={`notes-column-${columnIndex}`}
                style={styles.notesColumn}
              >
                {columnNotes.map((item, index) => {
                  const isDragging = draggingNoteId === item.id;

                  return (
                    <View
                      key={item.id}
                      style={[styles.cardSlot, isDragging && styles.activeCardSlot]}
                    >
                      <NoteCard
                        note={item}
                        contentFont={noteFont}
                        onDelete={() => { if (!showTrash) void handleDeleteNote(item.id); }}
                        onPress={() => {
                          if (!draggingNoteId) {
                            openMemoryDetail(item);
                          }
                        }}
                        onDragStart={() => {
                          if (!showTrash) {
                            setDraggingNoteId(item.id);
                            measureTrashTarget();
                          }
                        }}
                        onDragEnd={(absoluteX: number, absoluteY: number) => {
                          if (!showTrash) handleDragEnd(item.id, absoluteX, absoluteY);
                        }}
                        isMusicPlaying={activeMusicNoteId === item.id}
                        onToggleMusic={() => toggleCardMusic(item)}
                      />
                      {showTrash ? (
                        <View style={styles.trashCardActions}>
                          <TouchableOpacity
                            style={styles.trashActionButton}
                            onPress={() => void handleRestoreNote(item.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Restore memory"
                          >
                            <Ionicons name="arrow-undo-outline" size={18} color="#29463A" />
                            <Text style={styles.trashActionText}>Restore</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.trashActionButton, styles.permanentDeleteButton]}
                            onPress={() => handlePermanentDelete(item.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Delete memory permanently"
                          >
                            <Ionicons name="trash-outline" size={18} color="#A3332B" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.favoriteButton}
                          onPress={() => void toggleFavorite(item)}
                          accessibilityRole="button"
                          accessibilityLabel={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          hitSlop={8}
                        >
                          <Ionicons name={item.is_favorite ? 'heart' : 'heart-outline'} size={18} color={item.is_favorite ? '#A94F4F' : '#29463A'} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Create memory button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateNote')}
        accessibilityRole="button"
        accessibilityLabel="Create a new memory"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={groupDrawerVisible}
        transparent
        animationType="none"
        onShow={animateGroupDrawerIn}
        onRequestClose={closeGroupDrawer}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={styles.drawerScrim}
            onPress={closeGroupDrawer}
            accessibilityRole="button"
            accessibilityLabel="Close group journals drawer"
          />
          <Animated.View
            style={[
              styles.groupDrawer,
              { transform: [{ translateX: drawerTranslateX }] },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerEyebrow}>MAKE MEMORIES TOGETHER</Text>
                <Text style={styles.drawerTitle}>Group journals</Text>
              </View>
              <TouchableOpacity onPress={closeGroupDrawer} style={styles.drawerClose}>
                <Ionicons name="close" size={23} color="#29463A" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.drawerMainScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {/* Search stays at the top of the drawer. */}
            <Text style={styles.drawerSectionTitle}>FIND PEOPLE</Text>
            <TextInput value={userSearch} onChangeText={searchUsers}
              placeholder="Search by username..." placeholderTextColor="#8A8E84"
              autoCapitalize="none" autoCorrect={false} style={styles.userSearchInput}
              returnKeyType="search" />
            {searchingUsers && <ActivityIndicator color="#29463A" style={{ marginVertical: 8 }} />}
            {userSearch.trim().length >= 2 && !searchingUsers && userResults.length === 0 &&
              <Text style={styles.drawerHint}>No users found for that username.</Text>}
            {userResults.length > 0 && <ScrollView style={styles.userResultsList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {userResults.map((person: any) => {
                const selected = selectedUsers.some((item) => item.id === person.id);
                const avatar = person.avatar_url
                  ? supabase.storage.from('avatars').getPublicUrl(person.avatar_url).data.publicUrl : null;
                return <TouchableOpacity key={person.id}
                  style={[styles.userResultRow, selected && styles.userResultSelected]}
                  onPress={() => toggleSelectedUser(person)}>
                  {avatar ? <Image source={{ uri: avatar }} style={styles.userResultAvatar} /> :
                    <View style={styles.userResultDefaultAvatar}><Ionicons name="person" size={18} color="#29463A" /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userResultName}>@{person.username}</Text>
                    <Text style={styles.userResultPrivacy}>Private memories · Invite to a shared journal</Text>
                  </View>
                  <Ionicons name={selected ? 'checkmark-circle' : 'add-circle-outline'} size={23}
                    color={selected ? '#29463A' : '#777C72'} />
                </TouchableOpacity>;
              })}
            </ScrollView>}
            {selectedUsers.length > 0 && <View style={styles.createGroupPanel}>
              <Text style={styles.selectedCount}>{selectedUsers.length} member{selectedUsers.length === 1 ? '' : 's'} selected</Text>
              <TextInput value={groupTitle} onChangeText={setGroupTitle}
                placeholder="Name your group journal" placeholderTextColor="#8A8E84"
                style={styles.userSearchInput} maxLength={60} />
              <TouchableOpacity style={[styles.createGroupButton, creatingGroup && { opacity: 0.7 }]}
                onPress={createGroupJournal} disabled={creatingGroup}>
                {creatingGroup ? <ActivityIndicator color="#FFFFFF" /> : <>
                  <Ionicons name="people" size={18} color="#FFFFFF" />
                  <Text style={styles.createGroupButtonText}>Create group journal</Text>
                </>}
              </TouchableOpacity>
            </View>}

            <View style={styles.drawerDivider} />
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.drawerSectionTitle}>YOUR JOURNALS</Text>
              {myGroupJournals.length > 3 && <TouchableOpacity onPress={() => setAllItemsModal('groups')}>
                <Text style={styles.viewAllText}>View all ({myGroupJournals.length})</Text>
              </TouchableOpacity>}
            </View>
            {loadingGroups ? <ActivityIndicator color="#29463A" /> :
              myGroupJournals.length === 0 ? <Text style={styles.drawerHint}>Your shared journals will appear here.</Text> :
              myGroupJournals.slice(0, 3).map((group: any) => (
                <TouchableOpacity key={group.id} style={styles.groupListRow}
                  onPress={() => {
                    closeGroupDrawer();
                    navigation.navigate('GroupJournalDetail', { groupId: group.id, title: group.title });
                  }}>
                  <View style={[styles.groupListIcon, { backgroundColor: getGroupLogo(group.logo_key).color, borderRadius: 17 }]}>
                    <Ionicons name={getGroupLogo(group.logo_key).icon as any} size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.groupListName} numberOfLines={1}>{group.title}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#777C72" />
                </TouchableOpacity>
              ))}

            <View style={styles.drawerDivider} />
            <View style={styles.sectionHeadingRow}>
              <View style={styles.invitationSectionHeading}>
                <Text style={styles.drawerSectionTitle}>INVITATIONS</Text>
                {pendingInvitations.length > 0 && <View style={styles.invitationCountBadge}>
                  <Text style={styles.invitationCountText}>{pendingInvitations.length}</Text>
                </View>}
              </View>
              {pendingInvitations.length > 3 && <TouchableOpacity onPress={() => setAllItemsModal('invitations')}>
                <Text style={styles.viewAllText}>View all ({pendingInvitations.length})</Text>
              </TouchableOpacity>}
            </View>
            {loadingInvitations ? <ActivityIndicator color="#29463A" style={{ marginBottom: 8 }} /> :
              pendingInvitations.length === 0 ? <Text style={styles.drawerHint}>No pending invitations.</Text> :
              pendingInvitations.slice(0, 3).map((invitation: any) => {
                const busy = respondingInvitationId === invitation.id;
                const groupTitle = invitation.group?.title || 'Group journal';
                const inviterName = invitation.inviter?.username ? `@${invitation.inviter.username}` : 'A user';
                return <View key={invitation.id} style={styles.invitationRow}>
                  <TouchableOpacity style={styles.invitationTextBlock} onPress={() => openInvitationDetails(invitation)} accessibilityRole="button" accessibilityLabel={`View members of ${groupTitle}`}>
                    <Text style={styles.invitationGroupTitle} numberOfLines={1}>{groupTitle}</Text>
                    <Text style={styles.invitationSubtitle} numberOfLines={2}>{inviterName} invited you · tap to view members</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.invitationAction, styles.invitationAccept, busy && { opacity: 0.5 }]}
                    onPress={() => respondToInvitation(invitation, true)} disabled={busy}
                    accessibilityRole="button" accessibilityLabel={`Accept invitation to ${groupTitle}`}>
                    {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.invitationAction, styles.invitationDecline, busy && { opacity: 0.5 }]}
                    onPress={() => respondToInvitation(invitation, false)} disabled={busy}
                    accessibilityRole="button" accessibilityLabel={`Decline invitation to ${groupTitle}`}>
                    <Ionicons name="close" size={20} color="#7B3F38" />
                  </TouchableOpacity>
                </View>;
              })}
            <Text style={styles.drawerPrivacyNote}>Personal memories stay private. Only notes added to a group journal are shared with its members.</Text>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={allItemsModal !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAllItemsModal(null)}
      >
        <View style={styles.allItemsScreen}>
          <View style={styles.allItemsHeader}>
            <TouchableOpacity onPress={() => setAllItemsModal(null)} style={styles.allItemsBack}>
              <Ionicons name="arrow-back" size={22} color="#29463A" />
            </TouchableOpacity>
            <Text style={styles.allItemsTitle}>{allItemsModal === 'groups' ? 'All group journals' : 'All invitations'}</Text>
            <View style={{ width: 38 }} />
          </View>
          <ScrollView contentContainerStyle={styles.allItemsContent} keyboardShouldPersistTaps="handled">
            {allItemsModal === 'groups' ? (
              myGroupJournals.length === 0 ? <Text style={styles.drawerHint}>No group journals yet.</Text> :
              myGroupJournals.map((group: any) => (
                <TouchableOpacity key={group.id} style={styles.groupListRow}
                  onPress={() => {
                    setAllItemsModal(null);
                    closeGroupDrawer();
                    navigation.navigate('GroupJournalDetail', { groupId: group.id, title: group.title });
                  }}>
                  <View style={[styles.groupListIcon, { backgroundColor: getGroupLogo(group.logo_key).color, borderRadius: 17 }]}>
                    <Ionicons name={getGroupLogo(group.logo_key).icon as any} size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.groupListName} numberOfLines={2}>{group.title}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#777C72" />
                </TouchableOpacity>
              ))
            ) : (
              pendingInvitations.length === 0 ? <Text style={styles.drawerHint}>No pending invitations.</Text> :
              pendingInvitations.map((invitation: any) => {
                const busy = respondingInvitationId === invitation.id;
                const groupTitle = invitation.group?.title || 'Group journal';
                const inviterName = invitation.inviter?.username ? `@${invitation.inviter.username}` : 'A user';
                return <View key={invitation.id} style={styles.invitationRow}>
                  <TouchableOpacity style={styles.invitationTextBlock} onPress={() => openInvitationDetails(invitation)} accessibilityRole="button" accessibilityLabel={`View members of ${groupTitle}`}>
                    <Text style={styles.invitationGroupTitle} numberOfLines={1}>{groupTitle}</Text>
                    <Text style={styles.invitationSubtitle} numberOfLines={2}>{inviterName} invited you · tap to view members</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.invitationAction, styles.invitationAccept, busy && { opacity: 0.5 }]}
                    onPress={() => respondToInvitation(invitation, true)} disabled={busy}>
                    {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.invitationAction, styles.invitationDecline, busy && { opacity: 0.5 }]}
                    onPress={() => respondToInvitation(invitation, false)} disabled={busy}>
                    <Ionicons name="close" size={20} color="#7B3F38" />
                  </TouchableOpacity>
                </View>;
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={selectedInvitationDetails !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedInvitationDetails(null)}
      >
        <View style={styles.invitationDetailsScreen}>
          <View style={styles.allItemsHeader}>
            <TouchableOpacity onPress={() => setSelectedInvitationDetails(null)} style={styles.allItemsBack}>
              <Ionicons name="arrow-back" size={22} color="#29463A" />
            </TouchableOpacity>
            <Text style={styles.allItemsTitle}>Invitation details</Text>
            <View style={{ width: 38 }} />
          </View>
          <ScrollView contentContainerStyle={styles.invitationDetailsContent}>
            <View style={styles.invitationDetailsHero}>
              <View style={styles.invitationDetailsGroupIcon}>
                <Ionicons name="people" size={28} color="#29463A" />
              </View>
              <Text style={styles.invitationDetailsGroupTitle}>
                {selectedInvitationDetails?.group?.title || 'Group journal'}
              </Text>
              <Text style={styles.invitationDetailsDescription}>
                {selectedInvitationDetails?.inviter?.username
                  ? `@${selectedInvitationDetails.inviter.username} invited you to join this journal.`
                  : 'You have been invited to join this journal.'}
              </Text>
            </View>

            <View style={styles.membersSectionHeader}>
              <Text style={styles.drawerSectionTitle}>CURRENT MEMBERS</Text>
              {!loadingInvitationMembers && <Text style={styles.memberCountText}>{invitationMembers.length}</Text>}
            </View>
            {loadingInvitationMembers ? (
              <ActivityIndicator color="#29463A" size="large" style={{ marginVertical: 28 }} />
            ) : invitationMembers.length === 0 ? (
              <Text style={styles.drawerHint}>No member details are available yet.</Text>
            ) : invitationMembers.map((member: any) => (
              <View key={member.user_id} style={styles.invitationMemberRow}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={styles.invitationMemberAvatar} />
                ) : (
                  <View style={styles.invitationMemberAvatarFallback}>
                    <Ionicons name="person" size={18} color="#29463A" />
                  </View>
                )}
                <View style={styles.invitationMemberInfo}>
                  <Text style={styles.invitationMemberName} numberOfLines={1}>
                    {member.username ? `@${member.username}` : 'MemoryNotes member'}
                  </Text>
                  <Text style={styles.invitationMemberRole}>
                    {member.is_owner ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Member'}
                  </Text>
                </View>
                {member.is_owner && <Ionicons name="shield-checkmark" size={19} color="#29463A" />}
              </View>
            ))}
            <Text style={styles.invitationDetailsFootnote}>
              You will join this journal only after you accept the invitation.
            </Text>
          </ScrollView>
          <View style={styles.invitationDetailsActions}>
            <TouchableOpacity
              style={[styles.invitationDetailsButton, styles.invitationDetailsDecline, respondingInvitationId === selectedInvitationDetails?.id && { opacity: 0.6 }]}
              onPress={() => selectedInvitationDetails && respondToInvitation(selectedInvitationDetails, false)}
              disabled={!selectedInvitationDetails || respondingInvitationId === selectedInvitationDetails?.id}
            >
              <Ionicons name="close" size={19} color="#7B3F38" />
              <Text style={styles.invitationDetailsDeclineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.invitationDetailsButton, styles.invitationDetailsAccept, respondingInvitationId === selectedInvitationDetails?.id && { opacity: 0.6 }]}
              onPress={() => selectedInvitationDetails && respondToInvitation(selectedInvitationDetails, true)}
              disabled={!selectedInvitationDetails || respondingInvitationId === selectedInvitationDetails?.id}
            >
              {respondingInvitationId === selectedInvitationDetails?.id
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Ionicons name="checkmark" size={19} color="#FFFFFF" />}
              <Text style={styles.invitationDetailsAcceptText}>Accept invitation</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Memory detail */}
      {selectedNote && (
        <MemoryDetailModal
          note={selectedNote}
          contentFont={noteFont}
          canEdit={!showTrash}
          onClose={() => setSelectedNote(null)}
          onEdit={() => {
            const noteToEdit = selectedNote;
            setSelectedNote(null);
            navigation.navigate('CreateNote', { note: noteToEdit });
          }}
        />
      )}

      {/* Always-mounted trash target */}
      <View
        ref={trashRef}
        collapsable={false}
        pointerEvents={draggingNoteId !== null && !showTrash ? 'auto' : 'none'}
        style={[
          styles.trashDropZone,
          {
            opacity: draggingNoteId !== null && !showTrash ? 1 : 0,
            transform: [
              { scale: draggingNoteId !== null ? 1 : 0.85 },
            ],
          },
        ]}
        onLayout={measureTrashTarget}
      >
        <Text style={styles.trashIcon}>✕</Text>
        <Text style={styles.trashText}>Drop to Trash</Text>
      </View>
    </View>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F0E9',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#F1F0E9',
    borderBottomWidth: 1,
    borderBottomColor: '#DCDCD2',
    position: 'relative',
    minHeight: 108,
  },

  profileHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCDCD2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E4D9',
    zIndex: 1,
  },

  headerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },

  headerDefaultAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E4D9',
  },

  headerTitle: {
    position: 'absolute',
    left: 70,
    right: 70,
    top: 50,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#29463A',
  },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 1 },
  groupJournalBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, backgroundColor: '#E2E4D9', borderWidth: 1,
    borderColor: '#DCDCD2', zIndex: 1,
  },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(22,32,25,0.28)' },
  drawerScrim: { flex: 1 },
  groupDrawer: {
    width: Math.min(Dimensions.get('window').width * 0.86, 430), maxWidth: 430, height: '100%', backgroundColor: '#F1F0E9',
    paddingTop: 54, paddingHorizontal: 18, paddingBottom: 18,
    borderTopLeftRadius: 24, borderBottomLeftRadius: 24, elevation: 18,
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  drawerMainScroll: { flex: 1 },
  drawerEyebrow: { color: '#777C72', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  drawerTitle: { color: '#29463A', fontSize: 25, fontWeight: '800' },
  drawerClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  drawerSectionTitle: { color: '#29463A', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  viewAllText: { color: '#29463A', fontSize: 12, fontWeight: '800', marginBottom: 10 },
  allItemsScreen: { flex: 1, backgroundColor: '#F1F0E9', paddingTop: 54, paddingHorizontal: 20 },
  allItemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  allItemsBack: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  allItemsTitle: { color: '#29463A', fontSize: 21, fontWeight: '800' },
  allItemsContent: { paddingBottom: 30 },
  invitationDetailsScreen: { flex: 1, backgroundColor: '#F1F0E9', paddingTop: 54, paddingHorizontal: 20, paddingBottom: 18 },
  invitationDetailsContent: { paddingBottom: 24 },
  invitationDetailsHero: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 18, backgroundColor: '#FAFAF6', borderWidth: 1, borderColor: '#DCDCD2', borderRadius: 20, marginBottom: 24 },
  invitationDetailsGroupIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  invitationDetailsGroupTitle: { color: '#29463A', fontSize: 23, fontWeight: '800', textAlign: 'center' },
  invitationDetailsDescription: { color: '#777C72', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  membersSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  memberCountText: { color: '#29463A', fontSize: 12, fontWeight: '800', backgroundColor: '#E2E4D9', overflow: 'hidden', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  invitationMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, marginBottom: 7, borderRadius: 14, borderWidth: 1, borderColor: '#DCDCD2', backgroundColor: '#FAFAF6' },
  invitationMemberAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E2E4D9' },
  invitationMemberAvatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  invitationMemberInfo: { flex: 1, minWidth: 0 },
  invitationMemberName: { color: '#29463A', fontSize: 14, fontWeight: '800' },
  invitationMemberRole: { color: '#777C72', fontSize: 12, marginTop: 3 },
  invitationDetailsFootnote: { color: '#777C72', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16, marginBottom: 8 },
  invitationDetailsActions: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#DCDCD2' },
  invitationDetailsButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, flex: 1 },
  invitationDetailsDecline: { backgroundColor: '#F3E4E1', borderWidth: 1, borderColor: '#E6C9C4' },
  invitationDetailsAccept: { backgroundColor: '#29463A' },
  invitationDetailsDeclineText: { color: '#7B3F38', fontSize: 14, fontWeight: '800' },
  invitationDetailsAcceptText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  invitationSectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  invitationCountBadge: { minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#29463A', alignItems: 'center', justifyContent: 'center', marginTop: -8 },
  invitationCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  invitationList: { maxHeight: 150, flexGrow: 0 },
  invitationRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 9, marginBottom: 6, borderRadius: 13, borderWidth: 1, borderColor: '#DCDCD2', backgroundColor: '#FAFAF6' },
  invitationTextBlock: { flex: 1, minWidth: 0 },
  invitationGroupTitle: { color: '#29463A', fontSize: 13, fontWeight: '800' },
  invitationSubtitle: { color: '#777C72', fontSize: 10, lineHeight: 14, marginTop: 2 },
  invitationAction: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  invitationAccept: { backgroundColor: '#29463A' },
  invitationDecline: { backgroundColor: '#F3E4E1', borderWidth: 1, borderColor: '#E6C9C4' },
  drawerHint: { color: '#777C72', fontSize: 12, lineHeight: 18, paddingVertical: 10 },
  groupList: { maxHeight: 130 },
  groupListRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
  groupListIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  groupListName: { flex: 1, color: '#26352D', fontSize: 14, fontWeight: '700' },
  drawerDivider: { height: 1, backgroundColor: '#DCDCD2', marginVertical: 16 },
  userSearchInput: { backgroundColor: '#FAFAF6', borderWidth: 1, borderColor: '#DCDCD2', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: '#26352D', fontSize: 14, marginBottom: 8 },
  userResultsList: { flexGrow: 0, flexShrink: 1, minHeight: 60 },
  userResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  userResultSelected: { backgroundColor: '#E7E9DF', borderColor: '#C8D0C4' },
  userResultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E4D9' },
  userResultDefaultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  userResultName: { color: '#29463A', fontSize: 13, fontWeight: '800' },
  userResultPrivacy: { color: '#777C72', fontSize: 10, lineHeight: 14, marginTop: 2 },
  createGroupPanel: { borderTopWidth: 1, borderTopColor: '#DCDCD2', paddingTop: 12, marginTop: 8 },
  selectedCount: { color: '#29463A', fontSize: 12, fontWeight: '800', marginBottom: 8 },
  createGroupButton: { minHeight: 46, borderRadius: 13, backgroundColor: '#29463A', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  createGroupButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  drawerPrivacyNote: { color: '#777C72', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 12 },

  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F0E9',
  },

  loadingText: {
    marginTop: 12,
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 18,
    color: '#5F6B60',
  },

  memoryTools: {
    paddingTop: 12,
    paddingBottom: 2,
    backgroundColor: '#F1F0E9',
  },
  memorySearchBox: {
    minHeight: 44,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCDCD2',
    backgroundColor: '#FFFDF5',
  },
  memorySearchInput: {
    flex: 1,
    minWidth: 0,
    color: '#29463A',
    fontSize: 14,
    paddingVertical: 9,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 7,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCDCD2',
    backgroundColor: '#F8F7F1',
  },
  filterChipActive: {
    backgroundColor: '#29463A',
    borderColor: '#29463A',
  },
  filterChipText: { color: '#526054', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },
  tagChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#E5E8DF',
    borderWidth: 1,
    borderColor: '#D4D9CE',
  },
  tagChipActive: { backgroundColor: '#D1D9CB', borderColor: '#29463A' },
  tagChipText: { color: '#526054', fontSize: 11, fontWeight: '600' },
  tagChipTextActive: { color: '#29463A' },
  trashCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#E5E8DF',
    borderWidth: 1,
    borderColor: '#DCDCD2',
  },
  trashActionButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  permanentDeleteButton: {
    backgroundColor: '#FCE8E6',
    borderWidth: 1,
    borderColor: '#E9C5C1',
  },
  trashActionText: { color: '#29463A', fontSize: 12, fontWeight: '700' },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,245,0.96)',
    borderWidth: 1,
    borderColor: '#E0DED3',
    zIndex: 10,
    elevation: 5,
  },
  clearFiltersButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 16, backgroundColor: '#29463A' },
  clearFiltersText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  listContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 120,
  },

  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  notesColumn: {
    flex: 1,
    minWidth: 0,
  },

  cardSlot: {
    minWidth: 0,
    paddingHorizontal: 4,
    paddingBottom: 12,
    position: 'relative',
    zIndex: 1,
  },

  activeCardSlot: {
    zIndex: 1000,
    elevation: 40,
  },

  // Detail modal
  detailContainer: {
    flex: 1,
    backgroundColor: '#F1F0E9',
  },

  detailHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DCDCD2',
  },

  backText: {
    color: '#29463A',
    fontSize: 17,
    fontWeight: '600',
  },

  detailHeading: {
    color: '#29463A',
    fontSize: 18,
    fontWeight: '700',
  },

  editMemoryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E4D9',
  },

  detailContent: {
    padding: 16,
    paddingBottom: 40,
  },

  detailImageFrame: {
    marginRight: 16,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E3D9',
    borderRadius: 3,
  },

  detailNoteCard: {
    backgroundColor: '#FFFDF5',
    padding: 18,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#DCDCD2',
  },

  detailNote: {
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#333333',
  },

  detailMusicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E8DF',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },

  detailMusicTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#29463A',
  },

  detailMusicArtist: {
    fontSize: 14,
    color: '#5F6B60',
    marginTop: 4,
  },

  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#29463A',
    justifyContent: 'center',
    alignItems: 'center',
  },

  playButtonText: {
    color: '#F1F0E9',
    fontSize: 22,
    fontWeight: '600',
  },

  detailTimestamp: {
    fontFamily: 'PatrickHand_400Regular',
    color: '#73766D',
    fontSize: 15,
    marginTop: 18,
    textAlign: 'right',
  },

  // Trash drop target
  trashDropZone: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    width: 164,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#FCE8E6',
    borderWidth: 2,
    borderColor: '#C62828',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 12,
  },

  trashIcon: {
    fontSize: 26,
    fontWeight: '800',
    color: '#C62828',
  },

  trashText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C62828',
    marginTop: 2,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },

  emptyDecoration: {
    fontSize: 38,
    color: '#29463A',
    marginBottom: 10,
  },

  emptyTitle: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 32,
    color: '#29463A',
    marginBottom: 8,
  },

  emptySubtitle: {
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 19,
    color: '#73766D',
    textAlign: 'center',
    lineHeight: 25,
  },

  // Create button
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#29463A',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  fabIcon: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '300',
    marginTop: -2,
  },
});
