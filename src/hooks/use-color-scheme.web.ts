import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
const emptySubscribe = () => () => {};
const isServerSnapshot = () => false;
const isClientSnapshot = () => true;

export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(emptySubscribe, isClientSnapshot, isServerSnapshot);
  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}