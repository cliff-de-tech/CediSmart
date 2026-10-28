import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import GorhomBottomSheet, { type BottomSheetProps } from '@gorhom/bottom-sheet';

type BottomSheetMethods = GorhomBottomSheet;

/**
 * Drop-in replacement for `@gorhom/bottom-sheet`'s default `BottomSheet`.
 *
 * Why: with @gorhom/bottom-sheet v5 + Reanimated 4, sheets mounted with
 * `index={-1}` can end up rendered open on first layout (the closed detent is
 * never applied because `detents[-1]` is `undefined`). That made every panel on
 * Dashboard / Budgets / Settings appear open right after login.
 *
 * This wrapper only mounts the underlying sheet while it is actually open, so a
 * closed sheet can never be visible or intercept touches. The imperative API
 * (`snapToIndex`, `expand`, `close`, ...) is preserved, so callers don't change.
 */
type AppBottomSheet = BottomSheetMethods;

const AppBottomSheet = forwardRef<BottomSheetMethods, BottomSheetProps>(function AppBottomSheet(
  { index = -1, snapPoints, onChange, onClose, enableDynamicSizing, ...rest },
  ref
) {
  const innerRef = useRef<GorhomBottomSheet>(null);
  const [openIndex, setOpenIndex] = useState<number>(index);

  // Stabilise inline snap point arrays so re-renders don't recompute detents.
  const snapKey = JSON.stringify(
    Array.isArray(snapPoints) ? snapPoints : (snapPoints as any)?.value ?? null
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSnapPoints = useMemo(() => snapPoints, [snapKey]);
  const lastIndex = Array.isArray(snapPoints) ? Math.max(0, snapPoints.length - 1) : 0;
  const isOpen = openIndex >= 0;

  const markClosed = useCallback(() => setOpenIndex(-1), []);

  useImperativeHandle(
    ref,
    () => ({
      snapToIndex: (i: number, config?: any) => {
        if (i < 0) {
          innerRef.current?.close(config);
          return;
        }
        if (!isOpen) setOpenIndex(i);
        else innerRef.current?.snapToIndex(i, config);
      },
      snapToPosition: (position: number | string, config?: any) => {
        if (!isOpen) setOpenIndex(0);
        else innerRef.current?.snapToPosition(position, config);
      },
      expand: (config?: any) => {
        if (!isOpen) setOpenIndex(lastIndex);
        else innerRef.current?.expand(config);
      },
      collapse: (config?: any) => {
        if (!isOpen) setOpenIndex(0);
        else innerRef.current?.collapse(config);
      },
      close: (config?: any) => {
        if (isOpen) innerRef.current?.close(config);
      },
      forceClose: (config?: any) => {
        if (isOpen) innerRef.current?.forceClose(config);
        markClosed();
      },
    }),
    [isOpen, lastIndex, markClosed]
  );

  const handleChange = useCallback<NonNullable<BottomSheetProps['onChange']>>(
    (i, position, type) => {
      onChange?.(i, position, type);
      if (i === -1) markClosed();
    },
    [onChange, markClosed]
  );

  const handleClose = useCallback(() => {
    onClose?.();
    markClosed();
  }, [onClose, markClosed]);

  if (!isOpen) return null;

  return (
    <GorhomBottomSheet
      ref={innerRef}
      {...rest}
      index={openIndex}
      animateOnMount
      snapPoints={stableSnapPoints}
      enableDynamicSizing={enableDynamicSizing ?? false}
      onChange={handleChange}
      onClose={handleClose}
    />
  );
});

export default AppBottomSheet;
