import React, { useEffect } from 'react';
import { StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

interface AnimatedSplashProps {
  backgroundColor: string;
  onAnimationDone: () => void;
}

// how far each half starts from its resting spot, travelling along the
// capsule's own diagonal (matches the tilt in the source art, so the slide
// looks like it's following the seam rather than just flying in sideways)
const TRAVEL_DISTANCE = 220;

/**
 * Two halves slide in from opposite ends of the capsule's own diagonal and
 * snap together in the middle, then the whole thing holds a beat and fades
 * out into the app. Takes over the instant the native static splash hides.
 */
export function AnimatedSplash({ backgroundColor, onAnimationDone }: AnimatedSplashProps) {
  // both represent "distance still to travel" — start at TRAVEL_DISTANCE, animate down to 0
  const navyProgress = useSharedValue(TRAVEL_DISTANCE);
  const whiteProgress = useSharedValue(TRAVEL_DISTANCE);
  const snapScale = useSharedValue(1);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    const slideConfig = { duration: 480, easing: Easing.out(Easing.cubic) };

    // navy is the bottom-left half in the source art — comes in from further down-left
    navyProgress.value = withTiming(0, slideConfig);
    // white is the top-right half — comes in from further up-right, and arrives second
    whiteProgress.value = withTiming(0, slideConfig, (finished) => {
      if (!finished) return;
      // snap pulse right as the two halves meet
      snapScale.value = withSequence(
        withTiming(1.06, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 140, easing: Easing.inOut(Easing.quad) })
      );
    });

    // hold after the snap, then fade the whole screen out
    screenOpacity.value = withDelay(
      480 + 230 + 650,
      withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onAnimationDone)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -navyProgress.value },
      { translateY: navyProgress.value },
      { scale: snapScale.value },
    ],
  }));

  const whiteStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: whiteProgress.value },
      { translateY: -whiteProgress.value },
      { scale: snapScale.value },
    ],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, { backgroundColor }, screenStyle]}>
      <Animated.View style={[styles.layer, navyStyle]}>
        <Image
          source={require('../../../assets/icon-half-navy.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={[styles.layer, whiteStyle]}>
        <Image
          source={require('../../../assets/icon-half-white.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
});