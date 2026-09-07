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
  ready: boolean;
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
export function AnimatedSplash({ onAnimationDone, ready }: AnimatedSplashProps) {
  const reducedMotion = useReducedMotion();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(reducedMotion ? 1 : 0.92);
  const nameOpacity = useSharedValue(0);
  const nameShift = useSharedValue(reducedMotion ? 0 : 8);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    // Wait for the Inter faces: painting the wordmark with an unregistered
    // family lets Android's fallback shaping mangle it ("Nusx").
    if (!ready) return;

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
  }, [ready]);

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
          source={require('../../../assets/splash-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.Text style={[nameStyle, styles.wordmark]}>
        {/* Double NBSP: Android's text measurement can undercount the
            letterSpacing added after the last glyph, clipping it off. One
            trailing NBSP isn't always enough buffer at every size/spacing
            combo -- two is a safer margin.
            The case is baked into the literal for the same reason:
            Android measures the pre-transform string, so
            textTransform: 'uppercase' painted wider than measured
            and clipped the final glyph. */}
        {'NUSXA  '}
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
    width: 112,
    height: 111,
  },
  wordmark: {
    fontFamily: LATIN_FONTS.bold,
    fontSize: 26,
    letterSpacing: 2.2,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 21,
    paddingHorizontal: 24,
  },
});
