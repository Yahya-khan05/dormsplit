import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getSetting } from '@/database/operations';

export function useCurrency(): string {
  const [symbol, setSymbol] = useState('₹');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const s = await getSetting('currency');
          if (s) setSymbol(s);
        } catch (e) {
          console.error('Failed to load currency:', e);
        }
      })();
    }, [])
  );

  return symbol;
}