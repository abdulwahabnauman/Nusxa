import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Transient "success" state for inline button/row morphs. Instead of a
 * floating toast, the control the user just acted on briefly turns into a
 * green confirmation (check + label), right where their eyes already are.
 */
export function useSuccessMorph(durationMs = 1600) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    setActive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), durationMs);
  }, [durationMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { active, trigger };
}
