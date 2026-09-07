import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRoute } from '@react-navigation/native';
import { onTabPressed } from '../utils/tabEvents';

/**
 * Returns a tab screen to the top when the user presses its tab button
 * (switching back, or re-tapping while already focused) and when the screen
 * regains focus after a pushed screen is popped. The screen supplies the
 * actual scroll call because ScrollView and FlatList expose different APIs.
 */
export function useTabScrollReset(scrollToTop: () => void): void {
  const route = useRoute();
  const scrollRef = useRef(scrollToTop);
  useEffect(() => {
    scrollRef.current = scrollToTop;
  });

  useEffect(() => onTabPressed(route.name, () => scrollRef.current()), [route.name]);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current();
    }, [])
  );
}
