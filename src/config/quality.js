export const QUALITY_PRESETS = {
  performance: { label: 'Performance', pixelRatio: 0.72, antialias: false, shadows: false, shadowMapSize: 512, bloom: false },
  balanced: { label: 'Balanced', pixelRatio: 0.92, antialias: false, shadows: true, shadowMapSize: 512, bloom: false },
  ultra: { label: 'Ultra', pixelRatio: 1.15, antialias: true, shadows: true, shadowMapSize: 1024, bloom: true }
};
export function getQualityPreset(name) { return QUALITY_PRESETS[name] || QUALITY_PRESETS.balanced; }
