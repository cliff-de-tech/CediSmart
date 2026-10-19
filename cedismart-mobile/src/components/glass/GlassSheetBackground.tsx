import React from 'react';
import type { BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import { GlassSurface } from './GlassSurface';

export function GlassSheetBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  return <GlassSurface style={style} radius={32} variant="thick" elevated pointerEvents={pointerEvents} />;
}
