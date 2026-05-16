import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioEngine } from '../utils/audio';
import { getChordNotes, calculateOptimalPianoRange, formatChordName, normalizeNoteToSharp } from '../utils/chord-utils';
import { createPiano, populateNoteSelector, populateChordTypeSelector } from '../utils/piano-renderer';
import { MUSICAL_INTERVALS, INDEX_TO_SHARP_NAME, INDEX_TO_FLAT_NAME, NOTE_TO_INDEX } from '../utils/constants';
import type { SequenceItem, ShowInspectorFn } from '../types';

const EDITABLE_ALTERATIONS = ['b5', '#5', 'b9', '#9', '#11', 'b13'];

interface VisualizerModeProps {
  audioEngine: AudioEngine;
  showInspector: ShowInspectorFn;
}

const VisualizerMode: React.FC<VisualizerModeProps> = ({ audioEngine, showInspector }) => {
  const [rootNote, setRootNote] = useState<string>('C');
  const [chordType, setChordType] = useState<string>('Mayor');
  const [bassNote, setBassNote] = useState<string | undefined>(undefined);
  const [inversion, setInversion] = useState<number>(0);
  const [alterations, setAlterations] = useState<string[]>([]);
  const [additions, setAdditions] = useState<string[]>([]);
  const [currentChord, setCurrentChord] = useState<SequenceItem>({ rootNote: 'C', type: 'Mayor' });

  const ALTERATION_CONFLICT_PAIRS: [string, string][] = [['b5', '#5'], ['b9', '#9']];

  const pianoContainerRef = useRef<HTMLDivElement>(null);
  const rootNoteSelectRef = useRef<HTMLSelectElement>(null);
  const chordTypeSelectRef = useRef<HTMLSelectElement>(null);
  const bassNoteSelectRef = useRef<HTMLSelectElement>(null);

  // Opciones de inversión: notas base + notas añadidas
  const inversionOptions = useMemo(() => {
    const intervals = MUSICAL_INTERVALS[chordType];
    const baseCount = intervals ? intervals.length : 0;
    const count = baseCount + additions.length;
    return Array.from({ length: count }, (_, i) => ({
      value: i,
      label: i === 0 ? 'Fundamental' : `${i}ª Inversión`,
    }));
  }, [chordType, additions]);

  // Resetea la inversión si el nuevo tipo de acorde tiene menos notas
  useEffect(() => {
    if (inversionOptions.length > 0 && inversion >= inversionOptions.length) {
      setInversion(0);
    }
  }, [inversionOptions, inversion]);

  // Se actualiza el objeto del acorde cada vez que cambia una de sus partes
  useEffect(() => {
    setCurrentChord({
      rootNote,
      type: chordType,
      bassNote: bassNote === 'none' ? undefined : bassNote,
      inversion,
      alterations: alterations.length > 0 ? alterations : undefined,
      additions: additions.length > 0 ? additions : undefined,
    });
  }, [rootNote, chordType, bassNote, inversion, alterations, additions]);

  const handlePlayChord = useCallback(async () => {
    audioEngine.playChord(currentChord);
  }, [currentChord, audioEngine]);

  // ========================================================================
  // CORRECCIÓN: Esta función ahora se usa en el JSX para abrir el inspector.
  // ========================================================================
  const handleChordNameClick = useCallback(() => {
    showInspector(currentChord, {
      onUpdate: (updatedItem) => {
        setRootNote(updatedItem.rootNote);
        setChordType(updatedItem.type);
        setBassNote(updatedItem.bassNote);
        setInversion(updatedItem.inversion || 0);
        setAlterations(updatedItem.alterations || []);
        setAdditions(updatedItem.additions || []);
      }
    });
  }, [currentChord, showInspector]);

  useEffect(() => {
    if (pianoContainerRef.current) {
      const { notesToPress, bassNoteIndex, allNotesForRange } = getChordNotes(currentChord);

      if (allNotesForRange.length === 0) {
        pianoContainerRef.current.innerHTML = '';
      } else {
        const { startNote, endNote } = calculateOptimalPianoRange(allNotesForRange);
        createPiano(
          pianoContainerRef.current,
          startNote,
          endNote,
          notesToPress,
          false,
          bassNoteIndex,
          (noteIndex) => audioEngine?.playNote(noteIndex)
        );
      }
    }
  }, [currentChord, audioEngine]);

  useEffect(() => {
    const allNotes = [...new Set([...INDEX_TO_SHARP_NAME, ...INDEX_TO_FLAT_NAME])].sort((a, b) => NOTE_TO_INDEX[a] - NOTE_TO_INDEX[b] || a.localeCompare(b));
    if (rootNoteSelectRef.current) {
      populateNoteSelector(rootNoteSelectRef.current, allNotes);
      rootNoteSelectRef.current.value = normalizeNoteToSharp(rootNote);
    }
    if (bassNoteSelectRef.current) {
      populateNoteSelector(bassNoteSelectRef.current, allNotes, true);
      bassNoteSelectRef.current.value = bassNote ? normalizeNoteToSharp(bassNote) : 'none';
    }
  }, [bassNote, rootNote]);

  useEffect(() => {
    if (chordTypeSelectRef.current) {
      populateChordTypeSelector(chordTypeSelectRef.current, rootNote, chordType);
      chordTypeSelectRef.current.value = chordType;
    }
  }, [rootNote, chordType]);

  return (
    <>
      <div className="selector-panel">
        <div className="selector">
          <label className="selector-label" htmlFor="root-note-select">NOTA RAÍZ</label>
          <select id="root-note-select" className="selector-box" ref={rootNoteSelectRef} onChange={(e) => setRootNote(e.target.value)}></select>
        </div>
        <div className="selector">
          <label className="selector-label" htmlFor="chord-type-select">TIPO DE ACORDE</label>
          <select id="chord-type-select" className="selector-box" ref={chordTypeSelectRef} onChange={(e) => setChordType(e.target.value)}></select>
        </div>
        <div className="selector">
          <label className="selector-label" htmlFor="visualizer-bass-note-select">BAJO</label>
          <select id="visualizer-bass-note-select" className="selector-box" ref={bassNoteSelectRef} onChange={(e) => setBassNote(e.target.value === 'none' ? undefined : e.target.value)}></select>
        </div>
        <div className="selector">
          <label className="selector-label" htmlFor="visualizer-inversion-select">INVERSIÓN</label>
          <select id="visualizer-inversion-select" className="selector-box" value={inversion} onChange={(e) => setInversion(parseInt(e.target.value, 10))}>
            {inversionOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="alteraciones">
        {EDITABLE_ALTERATIONS.map(alt => (
            <button
                key={alt}
                className={`mod-button ${alterations.includes(alt) ? 'active' : ''}`}
                onClick={() => {
                    setAlterations(prev => {
                        if (prev.includes(alt)) return prev.filter(a => a !== alt);
                        const conflict = ALTERATION_CONFLICT_PAIRS.find(p => p.includes(alt))?.find(p => p !== alt);
                        const base = conflict ? prev.filter(a => a !== conflict) : prev;
                        return [...base, alt];
                    });
                }}
            >
                {alt}
            </button>
        ))}
        <button className="play-btn" aria-label="Reproducir acorde" onClick={handlePlayChord}>
            &#9654;
        </button>
      </div>

      {/* CORRECCIÓN: Se añade el evento onClick a este elemento */}
      <h2 className="chord-label" onClick={handleChordNameClick} style={{ cursor: 'pointer' }} title="Click para editar">
        {formatChordName(currentChord, { style: 'short' })}
      </h2>
      
      <div className="flex justify-center" ref={pianoContainerRef}>
        {/* El piano se renderiza aquí */}
      </div>
    </>
  );
};

export default VisualizerMode;
