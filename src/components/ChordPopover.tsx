import React, { useEffect, useRef, useCallback } from 'react';
import type { ChordSuggestion, SequenceItem } from '../types';
import { formatChordName } from '../utils/chord-utils';
import type { AudioEngine } from '../utils/audio';

interface ChordPopoverProps {
  isVisible: boolean;
  onClose: () => void;
  suggestions: ChordSuggestion[];
  onSuggestionClick: (chord: SequenceItem) => void;
  activeChord: SequenceItem | null;
  position: { x: number; y: number };
  audioEngine: AudioEngine | null;
}

const ChordPopover: React.FC<ChordPopoverProps> = ({
  isVisible,
  onClose,
  suggestions,
  onSuggestionClick,
  activeChord,
  position,
  audioEngine,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose]);

  // Cerrar al clickear fuera
  useEffect(() => {
    if (!isVisible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay para que no se cierre inmediatamente con el mismo click que lo abrió
    const timeoutId = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  // Ajustar posición para que no se salga de la pantalla
  useEffect(() => {
    if (!isVisible || !popoverRef.current) return;
    const el = popoverRef.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Si se sale por la derecha
    if (rect.right > vw - 12) {
      el.style.left = `${vw - rect.width - 12}px`;
    }
    // Si se sale por abajo, abrir hacia arriba
    if (rect.bottom > vh - 12) {
      el.style.top = `${position.y - rect.height - 8}px`;
    }
  }, [isVisible, position]);

  const handleSuggestionHover = useCallback((chord: SequenceItem) => {
    audioEngine?.playChord(chord, 0);
  }, [audioEngine]);

  if (!isVisible) return null;

  const title = activeChord
    ? formatChordName(activeChord, { style: 'short' })
    : 'Sugerencias';

  return (
    <div
      ref={popoverRef}
      className="chord-popover"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="chord-popover-header">
        <span className="chord-popover-title">Sugerencias para <strong>{title}</strong></span>
        <button className="chord-popover-close" onClick={onClose} aria-label="Cerrar">×</button>
      </div>

      <div className="chord-popover-body">
        {suggestions.length > 0 ? (
          <ul className="chord-popover-list">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="chord-popover-item"
                onClick={() => onSuggestionClick(s.chord)}
                onMouseEnter={() => handleSuggestionHover(s.chord)}
              >
                <span className="chord-popover-chord">
                  {formatChordName(s.chord, { style: 'short' })}
                </span>
                <span className="chord-popover-technique">{s.technique}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chord-popover-empty">Sin sugerencias para este contexto.</p>
        )}
      </div>
    </div>
  );
};

export default ChordPopover;
