// src/components/WatermarkPositionPicker.tsx
// ────────────────────────────────────────────────────────────────────────
// 3×3 grid picker for the AMOS watermark position.
//
// Visual: a phone-aspect rectangle with 9 tap targets; the selected cell
// shows a pink dot to indicate where the watermark will land. Optional
// platform-aware warning badges (⚠️) appear over cells that may be
// covered by the platform's UI overlay — we do NOT disable those cells
// (per user's explicit "no blocking" preference), just visually warn.
//
// Uses:
//   - Settings → DEVELOPER TOOLS → user-default + per-channel overrides
//   - PostReview → overlay editor → per-post override
//
// No state of its own — `value` + `onChange` are controlled by the caller.
// ────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { Warning } from 'phosphor-react-native';
// Keep in sync with supabase/functions/_shared/watermark.ts:WatermarkPosition
// (and the CHECK constraint in 20260518190000_watermark_position.sql).
export type WatermarkPosition =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const ALL_POSITIONS: ReadonlyArray<WatermarkPosition> = [
  'top-left',    'top-center',    'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const ROWS: ReadonlyArray<['top' | 'middle' | 'bottom', ReadonlyArray<WatermarkPosition>]> = [
  ['top',    ['top-left',    'top-center',    'top-right']],
  ['middle', ['middle-left', 'middle-center', 'middle-right']],
  ['bottom', ['bottom-left', 'bottom-center', 'bottom-right']],
];

interface Props {
  value: WatermarkPosition | null | undefined;
  onChange: (next: WatermarkPosition) => void;
  /** Visual size of the preview rectangle. Default 132×234 (9:16 phone aspect). */
  width?: number;
  height?: number;
  /** Cells to warn about (platform UI may overlap). Visual-only, doesn't disable. */
  warnPositions?: ReadonlySet<WatermarkPosition>;
  /** Optional label shown above the grid. */
  label?: string;
  disabled?: boolean;
}

export default function WatermarkPositionPicker({
  value,
  onChange,
  width = 132,
  height = 132,
  warnPositions,
  label,
  disabled,
}: Props) {
  const { colors } = useTheme();
  const current = value ?? 'top-left';
  const cellW = Math.floor(width / 3);
  const cellH = Math.floor(height / 3);

  return (
    <View>
      {label && (
        <Text
          style={{
            fontSize: fontSize.xs,
            fontWeight: fontWeight.semibold,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
      )}
      <View
        style={{
          width,
          height,
          borderRadius: borderRadius.md,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {ROWS.map(([rowKey, row], rowIdx) => (
          <View key={rowKey} style={{ flexDirection: 'row', flex: 1 }}>
            {row.map((pos) => {
              const isActive = pos === current;
              const isWarn = !!warnPositions?.has(pos);
              return (
                <TouchableOpacity
                  key={pos}
                  disabled={disabled}
                  activeOpacity={0.7}
                  onPress={() => onChange(pos)}
                  style={{
                    width: cellW,
                    height: cellH,
                    borderRightWidth: pos.endsWith('right') ? 0 : 1,
                    borderBottomWidth: rowIdx === 2 ? 0 : 1,
                    borderColor: colors.border + '70',
                    backgroundColor: isActive ? colors.primary + '22' : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {isActive ? (
                    <View
                      style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: colors.primary,
                        shadowColor: colors.primary,
                        shadowOpacity: 0.6,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 4,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 5, height: 5, borderRadius: 3,
                        backgroundColor: colors.textTertiary + '70',
                      }}
                    />
                  )}
                  {isWarn && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 2, right: 2,
                      }}
                    >
                      <Warning size={10} color="#F59E0B" weight="fill" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4, fontStyle: 'italic' }}>
        {labelOf(current)}
      </Text>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

const POSITION_LABELS_NL: Record<WatermarkPosition, string> = {
  'top-left':      'Linksboven',
  'top-center':    'Boven midden',
  'top-right':     'Rechtsboven',
  'middle-left':   'Midden links',
  'middle-center': 'Centrum',
  'middle-right':  'Midden rechts',
  'bottom-left':   'Linksonder',
  'bottom-center': 'Onder midden',
  'bottom-right':  'Rechtsonder',
};

export function labelOf(pos: WatermarkPosition): string {
  return POSITION_LABELS_NL[pos] ?? pos;
}

// Per-channel "risky" positions where the platform's UI typically overlays.
// We use this to draw a soft warning ⚠️ on the grid but never disable.
export const RISKY_POSITIONS_BY_CHANNEL: Record<string, ReadonlySet<WatermarkPosition>> = {
  tiktok:    new Set(['bottom-right', 'bottom-center', 'middle-right']),
  snapchat:  new Set(['top-left', 'top-center', 'top-right', 'bottom-center']),
  instagram: new Set([]), // feed posts are safe; Reels/Stories handled per-format
};
