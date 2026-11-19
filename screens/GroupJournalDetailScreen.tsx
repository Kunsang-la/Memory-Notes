// screens/GroupJournalDetailScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { getNoteImageSignedUrls } from '../services/storageService';

const C = { bg: '#F1F0E9', green: '#29463A', border: '#DCDCD2', text: '#26352D', muted: '#777C72', white: '#FFFFFF' };

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

function buildMasonryColumns(items: any[]) {
  const columns: any[][] = [[], []];
  const heights = [0, 0];
  items.forEach((item) => {
    const text = item.content?.trim() || '';
    const imageCount = Array.isArray(item.images) ? item.images.length : 0;
    const estimatedHeight = 100 + Math.min(150, Math.ceil(text.length / 30) * 16) + (imageCount ? 145 : 0) + (item.audio_track?.audioUrl ? 52 : 0);
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(item);
    heights[target] += estimatedHeight;
  });
  return columns;
}

// Notes arrive newest-first from Supabase. Group them by calendar month while
// preserving that order inside each month so the newest month is shown first.
function buildMonthSections(notes: any[]) {
  const groups = new Map<string, { title: string; notes: any[] }>();
  notes.forEach((note) => {
    const date = new Date(note.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) {
      groups.set(key, {
        title: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        notes: [],
      });
    }
    groups.get(key)!.notes.push(note);
  });
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    title: group.title,
    data: [{ key, notes: group.notes }],
  }));
}


export default function GroupJournalDetailScreen({ route, navigation }: any) {
  const { groupId, title } = route.params;
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [manageVisible, setManageVisible] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [groupOwnerId, setGroupOwnerId] = useState<string | null>(null);
  const [myGroupRole, setMyGroupRole] = useState<string | null>(null);
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const [membershipActionId, setMembershipActionId] = useState<string | null>(null);
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState(title || 'Group journal');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupLogoKey, setGroupLogoKey] = useState('people');
  const [logoDraft, setLogoDraft] = useState('people');
  const [editGroupVisible, setEditGroupVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title || '');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const player = useAudioPlayer('');

  const loadNotes = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      setCurrentUserId(authData.user?.id || null);
      const { data, error } = await supabase.from('group_notes')
        .select('id, group_id, author_id, title, content, images, audio_track, tags, created_at, edited_at')
        .eq('group_id', groupId).order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const ids = [...new Set(rows.map((n: any) => n.author_id))];
      let profiles: any[] = [];
      if (ids.length) {
        const { data: p, error: pe } = await supabase.from('profiles')
          .select('id, username, avatar_url').in('id', ids);
        if (pe) throw pe;
        profiles = p || [];
      }
      const map = new Map(profiles.map((p: any) => [p.id, {
        username: p.username,
        avatar: p.avatar_url ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl : null,
      }]));
      const notesWithImages = await Promise.all(
        rows.map(async (n: any) => {
          const signedImages = await getNoteImageSignedUrls(
            Array.isArray(n.images) ? n.images : []
          );

          return {
            ...n,
            images: signedImages,
            authorName: map.get(n.author_id)?.username || 'Memory Keeper',
            authorAvatar: map.get(n.author_id)?.avatar || null,
          };
        })
      );

      setNotes(notesWithImages);
    } catch (e: any) {
      Alert.alert('Unable to load group journal', e.message || 'Please try again.');
    } finally { setLoading(false); setRefreshing(false); }
  };

  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('Please sign in again.');

      const [{ data: group, error: groupError }, { data: rows, error: memberError }] = await Promise.all([
        supabase.from('group_journals').select('owner_id, title, description, logo_key').eq('id', groupId).single(),
        supabase.from('group_journal_members').select('group_id, user_id, role, joined_at').eq('group_id', groupId).order('joined_at', { ascending: true }),
      ]);
      if (groupError) throw groupError;
      if (memberError) throw memberError;

      const membershipRows = rows || [];
      const ids = [...new Set(membershipRows.map((row: any) => row.user_id))];
      let profileRows: any[] = [];
      if (ids.length) {
        const { data, error } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
        if (error) throw error;
        profileRows = data || [];
      }
      const profileMap = new Map(profileRows.map((profile: any) => [profile.id, profile]));
      const ownerId = group?.owner_id || null;
      setGroupOwnerId(ownerId);
      if (group?.title) setGroupTitle(group.title);
      setGroupDescription(group?.description || '');
      setGroupLogoKey(group?.logo_key || 'people');
      setLogoDraft(group?.logo_key || 'people');
      setTitleDraft(group?.title || title || '');
      setDescriptionDraft(group?.description || '');
      setMyGroupRole(membershipRows.find((row: any) => row.user_id === userId)?.role || null);
      setMembers(membershipRows.map((row: any) => {
        const profile: any = profileMap.get(row.user_id);
        const avatarPath = profile?.avatar_url;
        const avatar = avatarPath
          ? supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
          : null;
        return {
          ...row,
          username: profile?.username || 'Memory Keeper',
          avatar,
          isOwner: row.user_id === ownerId,
        };
      }));
    } catch (e: any) {
      Alert.alert('Unable to load members', e.message || 'Please try again.');
    } finally {
      setMembersLoading(false);
    }
  };

  const openManageMembers = async () => {
    setManageVisible(true);
    await loadMembers();
  };

  const searchGroupInviteUsers = async (value: string) => {
    setMemberSearch(value);
    if (value.trim().length < 2) {
      setMemberSearchResults([]);
      return;
    }

    setMemberSearchLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('Please sign in again.');

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${value.trim()}%`)
        .neq('id', userId)
        .order('username', { ascending: true })
        .limit(20);
      if (error) throw error;

      const existingMemberIds = new Set(members.map((member: any) => member.user_id));
      setMemberSearchResults((data || []).filter((person: any) => !existingMemberIds.has(person.id)));
    } catch (error: any) {
      Alert.alert('User search failed', error.message || 'Please try again.');
    } finally {
      setMemberSearchLoading(false);
    }
  };

  const sendGroupInvitation = async (person: any) => {
    if (!currentUserId || (currentUserId !== groupOwnerId && myGroupRole !== 'admin')) {
      Alert.alert('Not authorised', 'Only the group owner or an admin can invite members.');
      return;
    }
    if (members.some((member: any) => member.user_id === person.id)) {
      Alert.alert('Already a member', `@${person.username} is already in this group.`);
      return;
    }

    setSendingInviteId(person.id);
    try {
      const { data: existing, error: existingError } = await supabase
        .from('group_journal_invitations')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('invited_user_id', person.id)
        .eq('status', 'pending')
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        Alert.alert('Invitation already sent', `@${person.username} already has a pending invitation for this group.`);
        return;
      }

      const { error } = await supabase.from('group_journal_invitations').insert({
        group_id: groupId,
        invited_user_id: person.id,
        invited_by: currentUserId,
        status: 'pending',
        responded_at: null,
      });
      if (error) throw error;

      // Send a push notification after the invitation is successfully created.
      // Notification delivery is best-effort and must not change the existing
      // invitation/acceptance workflow if the push service is unavailable.
      try {
        const { error: notificationError } = await supabase.functions.invoke(
          'send-group-notification',
          {
            body: {
              event: 'group_invitation',
              groupId,
              invitedUserId: person.id,
              groupTitle: groupTitle || title || 'Group journal',
            },
          },
        );

        if (notificationError) {
          console.warn(
            'Invitation was created, but its push notification could not be sent:',
            notificationError.message,
          );
        }
      } catch (notificationError: any) {
        console.warn(
          'Invitation was created, but its push notification could not be sent:',
          notificationError?.message || notificationError,
        );
      }

      setMemberSearchResults((current) => current.filter((item) => item.id !== person.id));
      Alert.alert('Invitation sent', `@${person.username} can now accept or decline the invitation from their group invitations.`);
    } catch (error: any) {
      console.error('Could not send group invitation:', error);
      Alert.alert(
        'Could not send invitation',
        error?.message || 'Please try again. If this is a permissions error, the group invitation INSERT policy may need to allow owners and admins.',
      );
    } finally {
      setSendingInviteId(null);
    }
  };

  const closeAddMember = () => {
    setAddMemberVisible(false);
    setMemberSearch('');
    setMemberSearchResults([]);
  };

  const changeMemberRole = (member: any) => {
    if (!currentUserId || currentUserId !== groupOwnerId || member.isOwner) return;
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    Alert.alert(
      nextRole === 'admin' ? 'Make group admin?' : 'Remove admin role?',
      nextRole === 'admin'
        ? `Give @${member.username} permission to help manage this group?`
        : `Change @${member.username} back to a regular member?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setRoleSavingId(member.user_id);
            try {
              const { error } = await supabase.rpc('set_group_journal_member_role', {
                target_group_id: groupId,
                target_user_id: member.user_id,
                new_role: nextRole,
              });
              if (error) throw error;
              await loadMembers();
              Alert.alert('Role updated', `@${member.username} is now ${nextRole === 'admin' ? 'an admin' : 'a member'}.`);
            } catch (e: any) {
              Alert.alert('Unable to update role', e.message || 'Please try again.');
            } finally {
              setRoleSavingId(null);
            }
          },
        },
      ],
    );
  };


  const removeMember = (member: any) => {
    if (!currentUserId || member.isOwner) return;
    const isSelf = member.user_id === currentUserId;
    const canManage = currentUserId === groupOwnerId || myGroupRole === 'admin';
    if (!isSelf && !canManage) return;

    Alert.alert(
      isSelf ? 'Leave this group?' : 'Remove this member?',
      isSelf
        ? `You'll lose access to "${title || 'this group journal'}" and its shared memories.`
        : `Remove @${member.username} from this group? They will lose access to its shared memories.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSelf ? 'Leave group' : 'Remove member',
          style: 'destructive',
          onPress: async () => {
            setMembershipActionId(member.user_id);
            try {
              const { error } = await supabase
                .from('group_journal_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', member.user_id);
              if (error) throw error;

              if (isSelf) {
                setManageVisible(false);
                setMembers([]);
                player.pause();
                setPlayingId(null);
                Alert.alert('You left the group', 'You no longer have access to this group journal.');
                navigation.goBack();
              } else {
                await loadMembers();
                Alert.alert('Member removed', `@${member.username} has been removed from the group.`);
              }
            } catch (e: any) {
              Alert.alert(
                isSelf ? 'Unable to leave group' : 'Unable to remove member',
                e.message || 'Please check your permissions and try again.'
              );
            } finally {
              setMembershipActionId(null);
            }
          },
        },
      ]
    );
  };

  const transferOwnershipAndLeave = (newOwner: any) => {
    if (!currentUserId || currentUserId !== groupOwnerId || newOwner.isOwner || newOwner.user_id === currentUserId) return;

    Alert.alert(
      'Transfer ownership and leave?',
      `@${newOwner.username} will become the owner of \"${groupTitle || 'this group journal'}\". You will leave the group and lose access to its shared memories. This cannot be undone from this screen.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer & leave',
          style: 'destructive',
          onPress: async () => {
            setMembershipActionId(currentUserId);
            try {
              const { error } = await supabase.rpc('transfer_group_journal_ownership_and_leave', {
                target_group_id: groupId,
                new_owner_id: newOwner.user_id,
              });
              if (error) throw error;

              setManageVisible(false);
              setMembers([]);
              setNotes([]);
              player.pause();
              setPlayingId(null);
              Alert.alert('Ownership transferred', `@${newOwner.username} is now the group owner. You have left the group.`);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Unable to transfer ownership', e.message || 'Please check your permissions and try again.');
            } finally {
              setMembershipActionId(null);
            }
          },
        },
      ],
    );
  };

  const leaveGroup = () => {
    const self = members.find((member: any) => member.user_id === currentUserId);
    if (!self || self.isOwner) return;
    removeMember(self);
  };

  const openGroupSettings = () => {
    if (currentUserId !== groupOwnerId) {
      Alert.alert('Owner only', 'Only the group owner can edit the group name and description.');
      return;
    }
    setTitleDraft(groupTitle);
    setDescriptionDraft(groupDescription);
    setLogoDraft(groupLogoKey);
    setEditGroupVisible(true);
  };

  const saveGroupSettings = async () => {
    const cleanedTitle = titleDraft.trim();
    const cleanedDescription = descriptionDraft.trim();
    if (!cleanedTitle) {
      Alert.alert('Group name required', 'Enter a name for this group journal.');
      return;
    }
    if (!currentUserId || currentUserId !== groupOwnerId) {
      Alert.alert('Not authorized', 'Only the group owner can edit these settings.');
      return;
    }

    setGroupSaving(true);
    try {
      const { data, error } = await supabase
        .from('group_journals')
        .update({ title: cleanedTitle, description: cleanedDescription || null, logo_key: logoDraft })
        .eq('id', groupId)
        .eq('owner_id', currentUserId)
        .select('title, description, logo_key')
        .single();

      if (error) throw error;
      setGroupTitle(data.title);
      setGroupDescription(data.description || '');
      setGroupLogoKey(data.logo_key || 'people');
      setTitleDraft(data.title);
      setDescriptionDraft(data.description || '');
      setEditGroupVisible(false);
      navigation.setParams?.({ title: data.title });
      Alert.alert('Group updated', 'The group name and description have been saved.');
    } catch (e: any) {
      Alert.alert(
        'Unable to update group',
        e.message || 'Please run the group settings SQL policy and try again.'
      );
    } finally {
      setGroupSaving(false);
    }
  };

  // Read each image's original dimensions so cards preserve each photo's shape.
  useEffect(() => {
    notes.forEach((note: any) => {
      (note.images || []).forEach((uri: string) => {
        if (!uri || imageSizes[uri]) return;

        Image.getSize(
          uri,
          (width, height) => {
            if (width > 0 && height > 0) {
              setImageSizes((previous) => {
                if (previous[uri]) return previous;
                return { ...previous, [uri]: { width, height } };
              });
            }
          },
          (error) => console.warn('Could not get group memory image dimensions:', error)
        );
      });
    });
  }, [notes]);

  useFocusEffect(useCallback(() => { loadNotes(); loadMembers(); }, [groupId]));

  // One shared player keeps group-memory music from overlapping.
  const playTrack = (note: any) => {
    if (!note.audio_track?.audioUrl) return;
    try {
      if (playingId === note.id) {
        player.pause();
        setPlayingId(null);
      } else {
        player.pause();
        player.replace(note.audio_track.audioUrl);
        player.play();
        setPlayingId(note.id);
      }
    } catch (error) {
      console.error('Unable to play group memory music:', error);
      Alert.alert('Unable to play music', 'This track could not be played.');
    }
  };

  // Tapping the card stops any track playing in the grid. When the detail opens,
  // its own memory track starts automatically, matching the Home screen behavior.
  const openMemory = (note: any) => {
    player.pause();
    setPlayingId(null);
    setSelectedNote(note);
  };

  useEffect(() => {
    if (!selectedNote?.audio_track?.audioUrl) return;
    try {
      player.pause();
      player.replace(selectedNote.audio_track.audioUrl);
      player.play();
      setPlayingId(selectedNote.id);
    } catch (error) {
      console.error('Unable to start detail memory music:', error);
      setPlayingId(null);
    }
  }, [selectedNote?.id, selectedNote?.audio_track?.audioUrl]);

  const closeMemory = () => {
    player.pause();
    setPlayingId(null);
    setSelectedNote(null);
  };

  const createNote = () => navigation.navigate('CreateNote', { groupJournalId: groupId, groupJournalTitle: title });

  return <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={23} color={C.green} /></TouchableOpacity>
      <View style={[styles.headerLogo, { backgroundColor: getGroupLogo(groupLogoKey).color }]}>
        <Ionicons name={getGroupLogo(groupLogoKey).icon as any} size={19} color={C.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.heading} numberOfLines={1}>{groupTitle || 'Group journal'}</Text>
        <Text style={styles.subheading}>Shared memories · Members only</Text>
      </View>
      {currentUserId === groupOwnerId && <TouchableOpacity style={styles.settingsButton} onPress={openGroupSettings} accessibilityRole="button" accessibilityLabel="Edit group settings"><Ionicons name="settings-outline" size={21} color={C.green} /></TouchableOpacity>}
      <TouchableOpacity style={styles.manageButton} onPress={openManageMembers} accessibilityRole="button" accessibilityLabel="Manage group members"><Ionicons name="people-outline" size={22} color={C.green} /></TouchableOpacity>
      <TouchableOpacity style={styles.add} onPress={createNote}><Ionicons name="add" size={25} color={C.white} /></TouchableOpacity>
    </View>
    {loading ? <View style={styles.center}><ActivityIndicator size="large" color={C.green} /></View> :
      notes.length === 0 ? <View style={styles.empty}>
        <Ionicons name="people-circle-outline" size={58} color={C.green} />
        <Text style={styles.emptyTitle}>Start your shared story</Text>
        <Text style={styles.emptyCopy}>Add the first photo, note, or song. Only members of this journal can see these memories.</Text>
        <TouchableOpacity style={styles.primary} onPress={createNote}><Text style={styles.primaryText}>Create first memory</Text></TouchableOpacity>
      </View> :
      <SectionList
        sections={buildMonthSections(notes)}
        keyExtractor={(item: any) => item.key}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotes(); }} tintColor={C.green} />}
        renderSectionHeader={({ section }: any) => (
          <View style={styles.monthHeader}>
            <Text style={styles.monthHeaderText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }: any) => (
          <View style={styles.gridRow}>
            {buildMasonryColumns(item.notes).map((column, columnIndex) => (
              <View key={`${item.key}-column-${columnIndex}`} style={styles.column}>
                {column.map((n: any) => (
                  <TouchableOpacity key={n.id} activeOpacity={0.88} style={styles.card} onPress={() => openMemory(n)} accessibilityRole="button" accessibilityLabel={`Open memory by ${n.authorName}`}>
                    <View style={styles.authorRow}>
                      {n.authorAvatar ? <Image source={{ uri: n.authorAvatar }} style={styles.avatar} /> :
                        <View style={styles.avatarDefault}><Ionicons name="person" size={16} color={C.green} /></View>}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.authorName} numberOfLines={1}>@{n.authorName}</Text>
                        <Text style={styles.date}>{new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                      </View>
                    </View>
                    {Array.isArray(n.images) && n.images.length > 0 ? (() => {
                      const imageUri = n.images[0];
                      const dimensions = imageSizes[imageUri];
                      const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
                      return (
                        <Image
                          source={{ uri: imageUri }}
                          style={[styles.previewImage, { aspectRatio }]}
                          resizeMode="contain"
                        />
                      );
                    })() : null}
                    {!!n.content?.trim() && <Text style={styles.contentPreview} numberOfLines={n.images?.length ? 5 : 8}>{n.content}</Text>}
                    {!!n.audio_track?.audioUrl && <TouchableOpacity style={styles.musicPreview} activeOpacity={0.75} onPress={(event: any) => { event.stopPropagation?.(); playTrack(n); }} accessibilityRole="button" accessibilityLabel={`${playingId === n.id ? 'Pause' : 'Play'} ${n.audio_track.title || 'memory music'}`}><View style={styles.musicPlayIcon}><Ionicons name={playingId === n.id ? 'pause' : 'play'} size={13} color={C.white} /></View><Text style={styles.musicPreviewText} numberOfLines={1}>{n.audio_track.title || 'A song for this memory'}</Text><Ionicons name="musical-notes" size={15} color={C.green} /></TouchableOpacity>}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )}
      /> }
      <Modal visible={!!selectedNote} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeMemory}>
        <SafeAreaView style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={closeMemory} style={styles.detailBack}><Ionicons name="arrow-back" size={22} color={C.green} /><Text style={styles.detailBackText}>Back to journal</Text></TouchableOpacity>
            {selectedNote && currentUserId === selectedNote.author_id ? (
              <TouchableOpacity
                onPress={() => {
                  const noteToEdit = selectedNote;
                  closeMemory();
                  navigation.navigate('CreateNote', {
                    groupJournalId: groupId,
                    groupJournalTitle: title,
                    note: noteToEdit,
                  });
                }}
                style={styles.editButton}
                accessibilityRole="button"
                accessibilityLabel="Edit your group memory"
              >
                <Ionicons name="create-outline" size={20} color={C.green} />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            ) : <Ionicons name="people-outline" size={19} color={C.muted} />}
          </View>
          {selectedNote && <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            <View style={styles.detailAuthorRow}>
              {selectedNote.authorAvatar ? <Image source={{ uri: selectedNote.authorAvatar }} style={styles.detailAvatar} /> : <View style={styles.detailAvatarDefault}><Ionicons name="person" size={19} color={C.green} /></View>}
              <View style={{ flex: 1 }}><Text style={styles.detailAuthorName}>@{selectedNote.authorName}</Text><Text style={styles.detailDate}>{new Date(selectedNote.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text></View>
            </View>
            {Array.isArray(selectedNote.images) && selectedNote.images.map((uri: string, i: number) => {
              const dimensions = imageSizes[uri];
              const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
              return (
                <Image
                  key={`${selectedNote.id}-${i}`}
                  source={{ uri }}
                  style={[styles.detailImage, { aspectRatio }]}
                  resizeMode="contain"
                />
              );
            })}
            {!!selectedNote.content?.trim() && <View style={styles.detailContentCard}><Text style={styles.detailNoteText}>{selectedNote.content}</Text></View>}
            {Array.isArray(selectedNote.tags) && selectedNote.tags.length > 0 && <View style={styles.detailTags}>{selectedNote.tags.map((tag: string) => <View key={tag} style={styles.detailTag}><Text style={styles.detailTagText}>#{tag}</Text></View>)}</View>}
            {!!selectedNote.audio_track?.audioUrl && <TouchableOpacity style={styles.music} onPress={() => playTrack(selectedNote)}><View style={styles.play}><Ionicons name={playingId === selectedNote.id ? 'pause' : 'play'} size={18} color={C.white} /></View><View style={{ flex: 1 }}><Text style={styles.musicTitle}>{selectedNote.audio_track.title || 'Untitled track'}</Text><Text style={styles.musicArtist}>{selectedNote.audio_track.artist || 'Unknown artist'}</Text></View><Ionicons name="musical-notes" size={18} color={C.green} /></TouchableOpacity>}
          </ScrollView>}
        </SafeAreaView>
      </Modal>
      <Modal visible={editGroupVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditGroupVisible(false)}>
        <SafeAreaView style={styles.manageContainer}>
          <View style={styles.manageHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.manageTitle}>Group settings</Text>
              <Text style={styles.manageSubtitle}>Edit your journal details</Text>
            </View>
            <TouchableOpacity
              style={styles.manageClose}
              onPress={() => setEditGroupVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close group settings"
            >
              <Ionicons name="close" size={23} color={C.green} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>GROUP LOGO</Text>
            <View style={styles.logoGrid}>
              {GROUP_LOGOS.map((logo) => (
                <TouchableOpacity
                  key={logo.key}
                  style={styles.logoOption}
                  onPress={() => setLogoDraft(logo.key)}
                  disabled={groupSaving}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${logo.label} group logo`}
                >
                  <View style={[styles.logoCircle, { backgroundColor: logo.color }, logoDraft === logo.key && styles.logoCircleSelected]}>
                    <Ionicons name={logo.icon as any} size={24} color={C.white} />
                  </View>
                  <Text style={styles.logoLabel}>{logo.label}</Text>
                  {logoDraft === logo.key && <Ionicons name="checkmark-circle" size={16} color={C.green} />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>GROUP NAME</Text>
            <TextInput
              style={styles.settingsInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="Give your group a name"
              placeholderTextColor={C.muted}
              maxLength={80}
              autoCapitalize="sentences"
              editable={!groupSaving}
              accessibilityLabel="Group name"
            />
            <Text style={styles.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[styles.settingsInput, styles.descriptionInput]}
              value={descriptionDraft}
              onChangeText={setDescriptionDraft}
              placeholder="What is this group journal for? (optional)"
              placeholderTextColor={C.muted}
              maxLength={500}
              multiline
              textAlignVertical="top"
              editable={!groupSaving}
              accessibilityLabel="Group description"
            />
            <Text style={styles.settingsHelp}>Only the group owner can change these details.</Text>
            <TouchableOpacity
              style={[styles.saveSettingsButton, groupSaving && { opacity: 0.65 }]}
              onPress={saveGroupSettings}
              disabled={groupSaving}
              accessibilityRole="button"
              accessibilityLabel="Save group settings"
            >
              {groupSaving ? <ActivityIndicator color={C.white} /> : <Ionicons name="checkmark" size={19} color={C.white} />}
              <Text style={styles.saveSettingsText}>{groupSaving ? 'Saving…' : 'Save changes'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={manageVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setManageVisible(false)}>
        <SafeAreaView style={styles.manageContainer}>
          <View style={styles.manageHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.manageTitle}>Group members</Text>
              <Text style={styles.manageSubtitle}>{members.length} {members.length === 1 ? 'member' : 'members'} · {myGroupRole ? `Your role: ${myGroupRole}` : 'Journal access'}</Text>
            </View>
            <TouchableOpacity style={styles.manageClose} onPress={() => setManageVisible(false)} accessibilityRole="button" accessibilityLabel="Close group members">
              <Ionicons name="close" size={23} color={C.green} />
            </TouchableOpacity>
          </View>
          {(currentUserId === groupOwnerId || myGroupRole === 'admin') && (
            <TouchableOpacity
              style={styles.addMemberButton}
              onPress={() => setAddMemberVisible(true)}
              disabled={membersLoading}
              accessibilityRole="button"
              accessibilityLabel="Add members to this group journal"
            >
              <Ionicons name="person-add-outline" size={19} color={C.white} />
              <Text style={styles.addMemberButtonText}>Add members</Text>
            </TouchableOpacity>
          )}
          {membersLoading ? <View style={styles.center}><ActivityIndicator size="large" color={C.green} /></View> :
            <ScrollView contentContainerStyle={styles.memberList} showsVerticalScrollIndicator={false}>
              {members.length === 0 ? <Text style={styles.emptyMembers}>No member records were found for this journal.</Text> :
                members.map((member: any) => {
                  const canTransfer = currentUserId === groupOwnerId && !member.isOwner && member.user_id !== currentUserId;
                  const canChangeRole = currentUserId === groupOwnerId && !member.isOwner && member.user_id !== currentUserId;
                  const canRemove = !member.isOwner && member.user_id !== currentUserId &&
                    (currentUserId === groupOwnerId || myGroupRole === 'admin');
                  const canOpenMenu = canTransfer || canChangeRole || canRemove;
                  const menuOpen = openMemberMenuId === member.user_id;
                  return (
                    <View key={member.user_id} style={[styles.memberItemContainer, menuOpen && styles.memberItemContainerOpen]}>
                      <View style={styles.memberRow}>
                        {member.avatar ? <Image source={{ uri: member.avatar }} style={styles.memberAvatar} /> :
                          <View style={styles.memberAvatarDefault}><Ionicons name="person" size={18} color={C.green} /></View>}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.memberName} numberOfLines={1}>@{member.username}</Text>
                          <View style={styles.memberMeta}>
                            <Text style={styles.rolePill}>{member.isOwner ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Member'}</Text>
                            <Text style={styles.joinedDate}>Joined {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                          </View>
                        </View>
                        {canOpenMenu && (
                          <TouchableOpacity
                            style={styles.memberMenuButton}
                            onPress={() => setOpenMemberMenuId(menuOpen ? null : member.user_id)}
                            disabled={!!membershipActionId || !!roleSavingId}
                            accessibilityRole="button"
                            accessibilityLabel={`More options for ${member.username}`}
                          >
                            <Ionicons name="ellipsis-vertical" size={20} color={C.green} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {menuOpen && (
                        <View style={styles.memberActionMenu}>
                          {canChangeRole && (
                            <TouchableOpacity style={styles.memberActionItem} onPress={() => { setOpenMemberMenuId(null); changeMemberRole(member); }}>
                              <Ionicons name={member.role === 'admin' ? 'shield-half-outline' : 'shield-checkmark-outline'} size={18} color={C.green} />
                              <Text style={styles.memberActionText}>{member.role === 'admin' ? 'Remove admin role' : 'Make admin'}</Text>
                            </TouchableOpacity>
                          )}
                          {canRemove && (
                            <TouchableOpacity style={styles.memberActionItem} onPress={() => { setOpenMemberMenuId(null); removeMember(member); }}>
                              <Ionicons name="person-remove-outline" size={18} color="#8A4138" />
                              <Text style={[styles.memberActionText, styles.memberActionDestructive]}>Remove member</Text>
                            </TouchableOpacity>
                          )}
                          {canTransfer && (
                            <TouchableOpacity style={[styles.memberActionItem, styles.memberActionLast]} onPress={() => { setOpenMemberMenuId(null); transferOwnershipAndLeave(member); }}>
                              <Ionicons name="swap-horizontal" size={18} color="#8A4138" />
                              <Text style={[styles.memberActionText, styles.memberActionDestructive]}>Transfer ownership & leave</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              }
              {currentUserId === groupOwnerId && <Text style={styles.managementHint}>As the owner, open a member’s three-dot menu to change their role, remove them, or transfer ownership and leave. Ownership transfer is permanent from this screen.</Text>}
              {currentUserId !== groupOwnerId && myGroupRole === 'admin' && <Text style={styles.managementHint}>As an admin, you can remove non-owner members. Only the owner can change member roles.</Text>}
              {currentUserId !== groupOwnerId && myGroupRole !== 'admin' && <Text style={styles.managementHint}>You can leave this group at any time. Only the owner can change member roles.</Text>}
              {currentUserId && currentUserId !== groupOwnerId && !membersLoading && (
                <TouchableOpacity
                  style={styles.leaveButton}
                  onPress={leaveGroup}
                  disabled={!!membershipActionId}
                  accessibilityRole="button"
                  accessibilityLabel="Leave group journal"
                >
                  {membershipActionId === currentUserId ? <ActivityIndicator color="#8A4138" /> :
                    <Ionicons name="log-out-outline" size={19} color="#8A4138" />}
                  <Text style={styles.leaveButtonText}>Leave group</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          }
        </SafeAreaView>
      </Modal>
      <Modal visible={addMemberVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAddMember}>
        <SafeAreaView style={styles.manageContainer}>
          <View style={styles.manageHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.manageTitle}>Add members</Text>
              <Text style={styles.manageSubtitle}>Search by username · Invitation required</Text>
            </View>
            <TouchableOpacity style={styles.manageClose} onPress={closeAddMember} accessibilityRole="button" accessibilityLabel="Close add members">
              <Ionicons name="close" size={23} color={C.green} />
            </TouchableOpacity>
          </View>
          <View style={styles.addMemberSearchBox}>
            <Ionicons name="search-outline" size={19} color={C.muted} />
            <TextInput
              style={styles.addMemberSearchInput}
              value={memberSearch}
              onChangeText={searchGroupInviteUsers}
              placeholder="Enter at least 2 characters"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search users by username"
            />
            {memberSearch.length > 0 && <TouchableOpacity onPress={() => { setMemberSearch(''); setMemberSearchResults([]); }} accessibilityLabel="Clear user search"><Ionicons name="close-circle" size={18} color={C.muted} /></TouchableOpacity>}
          </View>
          {memberSearchLoading ? <View style={styles.center}><ActivityIndicator size="large" color={C.green} /></View> :
            <ScrollView contentContainerStyle={styles.memberSearchResults} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {memberSearch.trim().length < 2 ? (
                <Text style={styles.addMemberHelp}>Search for a MemoryNotes username to invite them to this journal.</Text>
              ) : memberSearchResults.length === 0 ? (
                <Text style={styles.addMemberHelp}>No available users found. They may already be members, or the username may not match.</Text>
              ) : memberSearchResults.map((person: any) => {
                const avatar = person.avatar_url ? supabase.storage.from('avatars').getPublicUrl(person.avatar_url).data.publicUrl : null;
                return (
                  <View key={person.id} style={styles.memberSearchRow}>
                    {avatar ? <Image source={{ uri: avatar }} style={styles.memberAvatar} /> : <View style={styles.memberAvatarDefault}><Ionicons name="person" size={18} color={C.green} /></View>}
                    <Text style={styles.memberName} numberOfLines={1}>@{person.username || 'Memory Keeper'}</Text>
                    <TouchableOpacity
                      style={[styles.inviteUserButton, sendingInviteId === person.id && { opacity: 0.65 }]}
                      onPress={() => sendGroupInvitation(person)}
                      disabled={!!sendingInviteId}
                      accessibilityRole="button"
                      accessibilityLabel={`Invite ${person.username}`}
                    >
                      {sendingInviteId === person.id ? <ActivityIndicator color={C.white} size="small" /> : <Text style={styles.inviteUserButtonText}>Invite</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          }
          <Text style={styles.addMemberFooter}>They will join only after accepting the invitation. Sending an invitation does not immediately grant access to group memories.</Text>
        </SafeAreaView>
      </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 18, fontWeight: '800', color: C.green },
  headerLogo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  logoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 10 },
  logoOption: { width: '19%', minWidth: 54, alignItems: 'center', gap: 4, paddingVertical: 3 },
  logoCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  logoCircleSelected: { borderColor: C.green, borderWidth: 3 },
  logoLabel: { color: C.text, fontSize: 10, textAlign: 'center' },
  subheading: { fontSize: 11, color: C.muted, marginTop: 3 },
  manageButton: { width: 38, height: 40, borderRadius: 20, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  settingsButton: { width: 38, height: 40, borderRadius: 20, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  settingsContent: { padding: 20, paddingBottom: 36 },
  fieldLabel: { color: C.green, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  settingsInput: { borderWidth: 1, borderColor: C.border, borderRadius: 13, backgroundColor: '#FFFDF8', paddingHorizontal: 14, paddingVertical: 13, color: C.text, fontSize: 15 },
  descriptionInput: { minHeight: 125, lineHeight: 21 },
  settingsHelp: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  saveSettingsButton: { marginTop: 24, backgroundColor: C.green, borderRadius: 13, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveSettingsText: { color: C.white, fontSize: 15, fontWeight: '800' },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  manageContainer: { flex: 1, backgroundColor: C.bg },
  manageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: C.border },
  manageTitle: { fontSize: 22, fontWeight: '800', color: C.green },
  manageSubtitle: { fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'capitalize' },
  manageClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  memberList: { padding: 16, paddingBottom: 32 },
  addMemberButton: { marginHorizontal: 16, marginTop: 14, marginBottom: 4, minHeight: 46, borderRadius: 13, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  addMemberButtonText: { color: C.white, fontSize: 14, fontWeight: '800' },
  addMemberSearchBox: { marginHorizontal: 18, marginTop: 18, marginBottom: 8, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: C.border, borderRadius: 13, backgroundColor: '#FFFDF8', paddingHorizontal: 13 },
  addMemberSearchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 10 },
  memberSearchResults: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18, gap: 9 },
  memberSearchRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 10 },
  inviteUserButton: { minWidth: 72, minHeight: 37, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  inviteUserButtonText: { color: C.white, fontSize: 12, fontWeight: '800' },
  addMemberHelp: { color: C.muted, fontSize: 13, lineHeight: 20, padding: 8 },
  addMemberFooter: { color: C.muted, fontSize: 11, lineHeight: 17, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  memberItemContainer: { position: 'relative', marginBottom: 10, zIndex: 1 },
  memberItemContainerOpen: { zIndex: 20, elevation: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 11 },
  memberAvatar: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#E2E4D9' },
  memberAvatarDefault: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  memberName: { color: C.green, fontSize: 14, fontWeight: '800' },
  memberMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  rolePill: { color: C.green, fontSize: 10, fontWeight: '800', backgroundColor: '#E2E4D9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  joinedDate: { color: C.muted, fontSize: 10 },
  memberMenuButton: { width: 34, height: 38, borderRadius: 12, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  memberActionMenu: { position: 'absolute', right: 8, top: 52, minWidth: 218, maxWidth: '92%', backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingVertical: 5, paddingHorizontal: 6, zIndex: 30, elevation: 12, shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  memberActionItem: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#ECEBE4' },
  memberActionLast: { borderBottomWidth: 0 },
  memberActionText: { flex: 1, color: C.green, fontSize: 13, fontWeight: '600' },
  memberActionDestructive: { color: '#8A4138' },
  leaveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#F3E4E1', borderRadius: 13, paddingVertical: 13, paddingHorizontal: 16, marginTop: 22 },
  leaveButtonText: { color: '#8A4138', fontSize: 14, fontWeight: '800' },
  managementHint: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
  emptyMembers: { color: C.muted, textAlign: 'center', marginTop: 30, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: C.green, marginTop: 14 },
  emptyCopy: { color: C.muted, textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  primary: { backgroundColor: C.green, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  primaryText: { color: C.white, fontSize: 14, fontWeight: '800' },
  list: { paddingHorizontal: 10, paddingTop: 13, paddingBottom: 35 },
  monthHeader: { backgroundColor: C.bg, paddingHorizontal: 7, paddingTop: 13, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  monthHeaderText: { color: C.green, fontSize: 17, fontWeight: '800' },
  gridRow: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, paddingHorizontal: 5 },
  card: { backgroundColor: '#FFFDF8', borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 10, elevation: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E2E4D9' },
  avatarDefault: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  authorName: { color: C.green, fontSize: 13, fontWeight: '800' },
  date: { color: C.muted, fontSize: 10, marginTop: 2 },
  noteTitle: { color: C.green, fontSize: 19, fontWeight: '800', marginBottom: 8 },
  previewImage: { width: '100%', borderRadius: 11, marginBottom: 7, backgroundColor: '#E2E4D9' },
  contentPreview: { color: C.text, fontSize: 15, lineHeight: 21, marginTop: 2 },
  musicPreview: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, padding: 7, borderRadius: 9, backgroundColor: '#E7E9DF' },
  musicPlayIcon: { width: 25, height: 25, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  musicPreviewText: { flex: 1, color: C.green, fontSize: 11, fontWeight: '700' },
  openHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  openHintText: { color: C.green, fontSize: 10, fontWeight: '700' },
  detailContainer: { flex: 1, backgroundColor: C.bg },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  detailBack: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  detailBackText: { color: C.green, fontSize: 15, fontWeight: '700' },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: '#E2E4D9' },
  editButtonText: { color: C.green, fontSize: 13, fontWeight: '800' },
  detailTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  detailTag: { backgroundColor: '#E2E4D9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  detailTagText: { color: C.green, fontSize: 12, fontWeight: '700' },
  detailContent: { padding: 17, paddingBottom: 36 },
  detailAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  detailAvatar: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#E2E4D9' },
  detailAvatarDefault: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#E2E4D9', alignItems: 'center', justifyContent: 'center' },
  detailAuthorName: { color: C.green, fontSize: 15, fontWeight: '800' },
  detailDate: { color: C.muted, fontSize: 12, marginTop: 3 },
  detailImage: { width: '100%', borderRadius: 13, marginBottom: 12, backgroundColor: '#E2E4D9' },
  detailContentCard: { backgroundColor: '#FFFDF5', borderRadius: 14, padding: 17, borderWidth: 1, borderColor: C.border, marginTop: 2 },
  detailNoteText: { color: C.text, fontSize: 19, lineHeight: 28 },
  music: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E7E9DF', borderRadius: 13, padding: 11, marginTop: 12 },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  musicTitle: { color: C.green, fontSize: 13, fontWeight: '800' },
  musicArtist: { color: C.muted, fontSize: 12, marginTop: 2 },
});
