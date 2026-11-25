import React, { useEffect, useRef } from 'react';
import { computeWaveformAmplitudes, type EffectiveTheme } from '../utils/userscript-helpers';

export function TtsWaveformVisualizer({
  isPlaying,
  volume,
  pitch,
  rate,
  compact = false,
  effectiveTheme = 'light'
}: {
  isPlaying: boolean;
  volume: number;
  pitch: number;
  rate: number;
  compact?: boolean;
  effectiveTheme?: EffectiveTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    let boundaryPulse = 0;

    const render = () => {
      const cvs = canvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d');
        if (ctx) {
          const w = cvs.width || 68;
          const h = cvs.height || 18;
          ctx.clearRect(0, 0, w, h);

          const amps = computeWaveformAmplitudes({
            isPlaying,
            volume,
            pitch,
            rate,
            timestamp: Date.now(),
            barCount: 12,
            boundaryPulse
          });

          if (boundaryPulse > 0.05) {
            boundaryPulse *= 0.88;
          } else {
            boundaryPulse = 0;
          }

          const numBars = amps.length;
          const gap = 2;
          const barW = Math.max(2, (w - gap * (numBars - 1)) / numBars);

          const rootStyle = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
          const accentPrimary = rootStyle?.getPropertyValue('--md-sys-color-primary').trim();
          const accentTertiary = rootStyle?.getPropertyValue('--md-sys-color-tertiary').trim();
          const grad = ctx.createLinearGradient(0, h, 0, 0);
          if (effectiveTheme === 'dark') {
            grad.addColorStop(0, '#5a94cc');
            grad.addColorStop(0.5, accentPrimary || '#a3c9ff');
            grad.addColorStop(1, accentTertiary || '#d6bee5');
          } else {
            grad.addColorStop(0, '#1e4b70');
            grad.addColorStop(0.5, accentPrimary || '#2d628c');
            grad.addColorStop(1, accentTertiary || '#6a5779');
          }

          const idleColor =
            effectiveTheme === 'dark' ? 'rgba(226, 226, 233, 0.24)' : 'rgba(25, 28, 32, 0.22)';

          for (let i = 0; i < numBars; i++) {
            const a = amps[i];
            const barH = Math.max(2, a * (h - 2));
            const x = i * (barW + gap);
            const y = (h - barH) / 2;

            ctx.fillStyle = isPlaying ? grad : idleColor;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x, y, barW, barH, 1.5);
            } else {
              ctx.rect(x, y, barW, barH);
            }
            ctx.fill();
          }
        }
      }

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(render);
    } else {
      render();
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, volume, pitch, rate, effectiveTheme]);

  return (
    <div
      className={`inline-flex items-center px-1.5 py-0.5 rounded-lg border transition-all min-w-0 max-w-full yt-tts-waveform-wrap ${
        isPlaying
          ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/40 shadow-xs'
          : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] opacity-80'
      }`}
      title={isPlaying ? 'Dynamic audio waveform: Active speech synthesis amplitude' : 'Dynamic audio waveform: Speech idle'}
    >
      <canvas
        ref={canvasRef}
        width={68}
        height={18}
        className={`${compact ? 'w-[48px]' : 'w-[68px]'} h-[18px] block yt-tts-waveform-canvas`}
      />
    </div>
  );
}
