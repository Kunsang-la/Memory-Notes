// App.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './lib/supabase';

import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import CreateNoteScreen from './screens/CreateNoteScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import ProfileScreen from './screens/ProfileScreen';
import TrashScreen from './screens/TrashScreen';
import MemoryTimelineScreen from './screens/MemoryTimelineScreen';
import SettingsScreen from './screens/SettingsScreen';
import GroupJournalDetailScreen from './screens/GroupJournalDetailScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Show notifications while MemoryNotes is in the foreground as well.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<any>();

type GroupNotificationData = {
  groupId?: string;
  groupTitle?: string;
};

async function registerPushToken(userId: string) {
  // Expo Go on Android does not support remote push-token registration.
  // Register tokens only in a development/standalone build.
  if (Constants.executionEnvironment === 'storeClient') {
    console.log('Remote push notifications require a development build; skipping Expo Go registration.');
    return;
  }

  // Remote push tokens are available on physical devices, not simulators.
  if (!Device.isDevice) {
    console.log('Push-token registration requires a physical device.');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#29463A',
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  let permissionStatus = currentPermission.status;

  if (permissionStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    permissionStatus = requestedPermission.status;
  }

  if (permissionStatus !== 'granted') {
    console.log('Notification permission was not granted.');
    return;
  }

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    throw new Error('Expo project ID is missing from the app configuration.');
  }

  const expoPushToken = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;

  const { error } = await supabase
    .from('user_push_tokens')
    .upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_name: Device.deviceName ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    );

  if (error) throw error;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const pendingGroupNotification = useRef<GroupNotificationData | null>(null);

  const openGroupFromNotification = (data: GroupNotificationData) => {
    if (!data?.groupId) return;

    if (navigationRef.isReady() && session?.user) {
      navigationRef.navigate('GroupJournalDetail', {
        groupId: data.groupId,
        title: data.groupTitle || 'Group journal',
      });
      pendingGroupNotification.current = null;
    } else {
      pendingGroupNotification.current = data;
    }
  };

  const flushPendingNotification = () => {
    const pending = pendingGroupNotification.current;
    if (pending && navigationRef.isReady() && session?.user) {
      navigationRef.navigate('GroupJournalDetail', {
        groupId: pending.groupId!,
        title: pending.groupTitle || 'Group journal',
      });
      pendingGroupNotification.current = null;
    }
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) {
        setSession(session);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Register this signed-in user's phone with Expo and store its token in Supabase.
  useEffect(() => {
    if (!session?.user?.id) return;

    registerPushToken(session.user.id).catch((error) => {
      console.warn('Could not register push notifications:', error?.message || error);
    });
  }, [session?.user?.id]);

  // Handle notification taps, including a notification that launched the app.
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as GroupNotificationData;
      openGroupFromNotification(data);
    };

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch((error) => {
        console.warn('Could not read the last notification response:', error);
      });

    return () => {
      responseSubscription.remove();
    };
  }, [session?.user?.id]);

  useEffect(() => {
    flushPendingNotification();
  }, [session?.user?.id]);

  useEffect(() => {
    let active = true;

    const checkProfileSetup = async () => {
      if (!session?.user) {
        setNeedsProfileSetup(false);
        setCheckingProfile(false);
        return;
      }

      setCheckingProfile(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active) return;

      // If the profile row is missing or the query fails, do not trap the user
      // on the onboarding screen. The database trigger should create this row.
      setNeedsProfileSetup(!error && data?.onboarding_completed === false);
      setCheckingProfile(false);
    };

    checkProfileSetup();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  if (loading || (session?.user && checkingProfile)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#29463A" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer
        ref={navigationRef}
        onReady={flushPendingNotification}
      >
        {session?.user ? (
          <Stack.Navigator
            key={needsProfileSetup ? 'profile-setup' : 'main-app'}
            initialRouteName={needsProfileSetup ? 'ProfileSetup' : 'Home'}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Trash" component={TrashScreen} />
            <Stack.Screen name="MemoryTimeline" component={MemoryTimelineScreen} />
            <Stack.Screen name="GroupJournalDetail" component={GroupJournalDetailScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen
              name="CreateNote"
              component={CreateNoteScreen}
              options={{ headerShown: true, title: 'New Memory' }}
            />
            <Stack.Screen
              name="ProfileSetup"
              options={{ gestureEnabled: false }}
            >
              {(props) => (
                <ProfileSetupScreen
                  {...props}
                  onComplete={() => setNeedsProfileSetup(false)}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        ) : (
          <AuthScreen />
        )}
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F0E9',
  },
});
