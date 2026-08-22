import React, { useEffect } from 'react';
import { StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

interface AnimatedSplashProps {
  backgroundColor: string;
  onAnimationDone: () => void;
}

/**
 * Takes over the instant the native static splash hides. Fades/scales the
 * real icon in, holds it a beat, then fades everything out before handing
 * control back to the app. Keep this snappy, nobody wants to stare at a logo.
 */
export function AnimatedSplash({ backgroundColor, onAnimationDone }: AnimatedSplashProps) {
  const scale = useSharedValue(0.85);
  const logoOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    scale.value = withSequence(
      withTiming(1.05, { duration: 350, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 150, easing: Easing.inOut(Easing.quad) })
    );

    // hold for a moment so the logo actually registers, then fade the whole thing out
    const timer = setTimeout(() => {
      screenOpacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onAnimationDone)();
      });
    }, 900);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: scale.value }],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, { backgroundColor }, screenStyle]}>
      <Animated.View style={logoStyle}>
        <Image
          source={require('../../../assets/icon.png')}
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
  logo: {
    width: 140,
    height: 140,
  },
});
