import React, { useEffect } from 'react';
import { StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface AnimatedSplashProps {
  backgroundColor: string;
  onAnimationDone: () => void;
}

/**
 * Gentle opening: the logo fades in while softly "breathing" from 92% to
 * full size, the app name rises in beneath it, the mark holds for a beat,
 * then the whole screen fades into the app. Calm and slow-moving on
 * purpose — no crashes or fast flying parts — and reduced-motion users
 * get plain fades only.
 */
export function AnimatedSplash({ backgroundColor, onAnimationDone }: AnimatedSplashProps) {
  const { colors, typography } = useTheme();
  const reducedMotion = useReducedMotion();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(reducedMotion ? 1 : 0.92);
  const nameOpacity = useSharedValue(0);
  const nameShift = useSharedValue(reducedMotion ? 0 : 8);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    const breathe = { duration: 640, easing: Easing.out(Easing.cubic) };

    logoOpacity.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, breathe);

    // The name follows a moment after the logo settles in
    nameOpacity.value = withDelay(300, withTiming(1, { duration: 420 }));
    nameShift.value = withDelay(300, withTiming(0, breathe));

    // Hold the assembled mark for a beat, then fade into the app
    screenOpacity.value = withDelay(
      1100,
      withTiming(0, { duration: 280 }, (finished) => {
        if (finished) runOnJS(onAnimationDone)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const nameStyle = useAnimatedStyle(() => ({
    opacity: nameOpacity.value,
    transform: [{ translateY: nameShift.value }],
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
      <Animated.Text
        style={[nameStyle, typography.heading.h2, { color: colors.text.primary, marginTop: 14, letterSpacing: 1.5 }]}
      >
        Nusxa
      </Animated.Text>
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
    width: 160,
    height: 160,
  },
});
