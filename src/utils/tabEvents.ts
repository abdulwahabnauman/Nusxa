import { DeviceEventEmitter } from 'react-native';

const TAB_PRESSED = 'nusxa:tab-pressed';

/** Broadcast that a bottom-tab button was pressed (focused or not). */
export function notifyTabPressed(routeName: string): void {
  DeviceEventEmitter.emit(TAB_PRESSED, routeName);
}

/**
 * Subscribe to presses of one specific tab button. Returns an unsubscribe
 * function. Lets screens react to "my tab was tapped" — switching back to it
 * or re-tapping it while already focused — without coupling to the tab bar.
 */
export function onTabPressed(routeName: string, listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(TAB_PRESSED, (name: string) => {
    if (name === routeName) listener();
  });
  return () => sub.remove();
}
