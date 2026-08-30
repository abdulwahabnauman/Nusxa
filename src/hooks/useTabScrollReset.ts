import { useEffect } from 'react';
import type { ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { onTabPressed } from '../utils/tabEvents';

/**
 * Scrolls the given ScrollView back to the top whenever the user presses
 * this screen's tab button — both when coming back from another tab and
 * when re-tapping the tab while already on it (standard mobile behavior).
 * Returning via back-navigation from a pushed screen keeps the position.
 */
export function useTabScrollReset(ref: React.RefObject<ScrollView | null>): void {
  const route = useRoute();
  useEffect(() => {
    return onTabPressed(route.name, () => {
      ref.current?.scrollTo({ y: 0, animated: true });
    });
  }, [route.name, ref]);
}
