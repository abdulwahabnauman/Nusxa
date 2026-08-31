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
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { LATIN_FONTS } from '../../theme/typography';

// One splash look everywhere: the native splash (app.json) and this animated
// handoff both use the same black, so there is no second color variant.
export const SPLASH_BACKGROUND = '#000000';

interface AnimatedSplashProps {
  onAnimationDone: () => void;
}

/**
 * Gentle opening: the logo fades in while softly "breathing" from 92% to
 * full size, the wordmark rises in beneath it, the mark holds for a beat,
 * then the whole screen fades into the app. Calm and slow-moving on
 * purpose — no crashes or fast flying parts — and reduced-motion users
 * get plain fades only.
 *
 * The wordmark always renders with the Latin Inter face: in Urdu mode the
 * theme's heading family is Noto Nastaliq Urdu, whose shaping mangled the
 * Latin brand text (it displayed as "Nusx").
 */
export function AnimatedSplash({ onAnimationDone }: AnimatedSplashProps) {
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
    <Animated.View style={[styles.container, screenStyle]}>
      <Animated.View style={logoStyle}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.Text style={[nameStyle, styles.wordmark]}>
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
    backgroundColor: SPLASH_BACKGROUND,
    zIndex: 10,
  },
  logo: {
    width: 210,
    height: 210,
  },
  wordmark: {
    fontFamily: LATIN_FONTS.bold,
    fontSize: 30,
    letterSpacing: 3,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
});
