
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

export default function NoteCard({
  note,
  onDelete,
  onPress,
  onDragStart,
  onDragEnd,
  isMusicPlaying = false,
  onToggleMusic,
  contentFont = 'original',
}: {
  note: any;
  onDelete: () => void;
  onPress: () => void;
  onDragStart: () => void;
  onDragEnd: (absoluteX: number, absoluteY: number) => void;
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
  contentFont?: 'original' | 'caveat' | 'patrick-hand' | 'typewriter' | 'serif';
}) {
  const selectedContentFont = contentFont === 'caveat' ? 'Caveat_700Bold'
    : contentFont === 'patrick-hand' ? 'PatrickHand_400Regular'
    : contentFont === 'typewriter' ? 'monospace'
    : contentFont === 'serif' ? 'serif' : undefined;

  const [galleryWidth, setGalleryWidth] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageSizes, setImageSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});

  const hasPhotos =
    Array.isArray(note.images) && note.images.length > 0;
  const hasContent = Boolean(note.content?.trim());
  const hasMusic = Boolean(note.audio_track);

  useEffect(() => {
    setActiveImageIndex(0);

    (note.images || []).forEach((uri: string) => {
      Image.getSize(
        uri,
        (width, height) => {
          setImageSizes((previous) => {
            if (previous[uri]) return previous;
            return { ...previous, [uri]: { width, height } };
          });
        },
        () => {
          // The image can still render if dimensions cannot be retrieved.
        }
      );
    });
  }, [note.id, note.images]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  // Keep the original paper/Polaroid styling; only animate the card while dragging.
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      {
        rotate: withSpring(isDragging.value ? '-2deg' : '0deg', {
          damping: 18,
          stiffness: 200,
        }),
      },
    ],
    shadowOpacity: withTiming(isDragging.value ? 0.25 : 0.09),
    shadowRadius: withTiming(isDragging.value ? 16 : 7),
    elevation: isDragging.value ? 40 : 4,
    zIndex: isDragging.value ? 1000 : 1,
  }));

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(320)
    .maxPointers(1)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(0.88, { damping: 14, stiffness: 220 });
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(onDragEnd)(event.absoluteX, event.absoluteY);
    })
    .onFinalize(() => {
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      scale.value = withSpring(1, { damping: 16, stiffness: 220 });
      isDragging.value = false;
    });

  // The child music gesture gets priority over the card tap, so tapping play
  // does not also open the memory detail.
  const musicTapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_event, success) => {
      if (success && onToggleMusic) {
        runOnJS(onToggleMusic)();
      }
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .requireExternalGestureToFail(musicTapGesture)
    .onEnd((_event, success) => {
      if (success) {
        runOnJS(onPress)();
      }
    });

  const cardGesture = Gesture.Race(dragGesture, tapGesture);

  const dateLabel = new Date(note.created_at).toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );

  return (
    <View>
      <GestureDetector gesture={cardGesture}>
        <Animated.View
          style={[
            styles.card,
            hasPhotos ? styles.photoCard : styles.paperCard,
            animatedCardStyle,
          ]}
        >
          {hasPhotos ? (
            <View style={styles.polaroidFrame}>
              <View
                style={styles.imageGallery}
                onLayout={(event) =>
                  setGalleryWidth(event.nativeEvent.layout.width)
                }
              >
                {galleryWidth > 0 && (
                  <FlatList
                    key={`${note.id}-${galleryWidth}`}
                    data={note.images}
                    horizontal
                    pagingEnabled
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(uri, index) => `${uri}-${index}`}
                    getItemLayout={(_, index) => ({
                      length: galleryWidth,
                      offset: galleryWidth * index,
                      index,
                    })}
                    onMomentumScrollEnd={(event) => {
                      setActiveImageIndex(
                        Math.round(
                          event.nativeEvent.contentOffset.x /
                            galleryWidth
                        )
                      );
                    }}
                    renderItem={({ item: uri }) => {
                      const size = imageSizes[uri];
                      const naturalHeight =
                        size && size.width > 0
                          ? galleryWidth * (size.height / size.width)
                          : galleryWidth;

                      return (
                        <View
                          style={{
                            width: galleryWidth,
                            height: Math.max(
                              150,
                              Math.min(naturalHeight, 250)
                            ),
                          }}
                        >
                          <Image
                            source={{ uri }}
                            style={styles.photo}
                            resizeMode="cover"
                          />
                        </View>
                      );
                    }}
                  />
                )}

                {note.images.length > 1 && (
                  <View style={styles.photoCounter}>
                    <Text style={styles.photoCounterText}>
                      {activeImageIndex + 1} / {note.images.length}
                    </Text>
                  </View>
                )}
              </View>

              {hasContent && (
              <View style={styles.captionArea}>
                <Text
                  style={[styles.handwrittenCaption, selectedContentFont ? { fontFamily: selectedContentFont } : undefined]}
                  numberOfLines={3}
                >
                  {note.content}
                </Text>
              </View>
            )}
            </View>
          ) : (
            <View style={styles.paperInner}>
              <View style={styles.paperHeader}>
                <Text style={styles.paperDecoration}>✳</Text>
                <View style={styles.paperLine} />
              </View>

              <Text style={[styles.handwrittenNote, selectedContentFont ? { fontFamily: selectedContentFont } : undefined]}>
                {hasContent ? note.content : 'A little memory ♡'}
              </Text>

              <View style={styles.paperFooter}>
                <Text style={styles.paperHeart}></Text>
              </View>
            </View>
          )}

          {hasMusic && (
            <View style={styles.musicChip}>
              <View style={styles.musicIconCircle}>
                <Text style={styles.musicIcon}>♫</Text>
              </View>

              <View style={styles.musicDetails}>
                <Text numberOfLines={1} style={styles.musicText}>
                  {note.audio_track.title || 'Untitled track'}
                </Text>
                <Text numberOfLines={1} style={styles.musicArtist}>
                  {note.audio_track.artist || 'Unknown artist'}
                </Text>
              </View>

              <GestureDetector gesture={musicTapGesture}>
                <View
                  style={styles.playButtonHitArea}
                  accessibilityRole="button"
                  accessibilityLabel={isMusicPlaying ? 'Pause music' : 'Play music'}
                >
                  <Text style={styles.playIcon}>
                    {isMusicPlaying ? 'Ⅱ' : '▶'}
                  </Text>
                </View>
              </GestureDetector>
            </View>
          )}

          <View style={styles.cardFooter}>
            <View style={styles.footerDot} />
            <Text style={styles.timestamp}>{dateLabel}</Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginBottom: 18,
    borderWidth: 1,
    shadowColor: '#343B30',
    shadowOffset: { width: 0, height: 5 },
  },

  // Text-only paper memory
  paperCard: {
    backgroundColor: '#F1F0E9',
    borderColor: '#E5DDCA',
    borderRadius: 4,
    padding: 14,
    minHeight: 160,
  },

  paperInner: {
    flex: 1,
  },

  paperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  paperDecoration: {
    color: '#829078',
    fontSize: 20,
    marginRight: 8,
  },

  paperLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8E2D4',
  },

  handwrittenNote: {
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 20,
    lineHeight: 27,
    color: '#39483B',
  },

  paperFooter: {
    alignItems: 'flex-end',
    marginTop: 8,
  },

  paperHeart: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 22,
    color: '#9B8B79',
  },

  // Photo memory / Polaroid
  photoCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 3,
    padding: 8,
  },

  polaroidFrame: {
    backgroundColor: '#FFFFFF',
  },

  imageGallery: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#EAE8E0',
  },

  photo: {
    width: '100%',
    height: '100%',
  },

  photoCounter: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    backgroundColor: 'rgba(35, 48, 37, 0.76)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  photoCounterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },

  captionArea: {
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingTop: 7,
    paddingBottom: 4,
  },

  handwrittenCaption: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: '#354637',
    textAlign: 'center',
  },
  // Music attachment
  musicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#29463A',
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 9,
    marginTop: 10,
    gap: 8,
  },

  musicIconCircle: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#E4E9DF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  musicIcon: {
    fontSize: 17,
    color: '#29463A',
  },

  musicDetails: {
    flex: 1,
  },

  musicText: {
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 15,
    color: '#FFFFFF',
  },

  musicArtist: {
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 12,
    color: '#D5DFD2',
    marginTop: -2,
  },

  playButtonHitArea: {
    minWidth: 30,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },

  playIcon: {
    fontSize: 13,
    color: '#FFFFFF',
  },

  // Shared footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 9,
    gap: 5,
  },

  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A3A18F',
  },

  timestamp: {
    fontFamily: 'PatrickHand_400Regular',
    fontSize: 13,
    color: '#898779',
  },
});
