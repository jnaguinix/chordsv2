import React, { useState, useEffect, useRef, useCallback } from 'react';
import { populateNoteSelector, populateChordTypeSelector, createPiano } from '../utils/piano-renderer';
import { getChordNotes, calculateOptimalPianoRange, formatChordName, transposeChord, normalizeNoteToSharp } from '../utils/chord-utils';
import { MUSICAL_INTERVALS, INDEX_TO_SHARP_NAME, INDEX_TO_FLAT_NAME, NOTE_TO_INDEX } from '../utils/constants';
import type { SequenceItem } from '../types';
import type { AudioEngine } from '../utils/audio';

const EDITABLE_ALTERATIONS = ['b5', '#5', 'b9', '#9', '#11', 'b13'];
const EDITABLE_ADDITIONS = ['add(9)', 'add(11)', 'add(6)'];
const ALTERATION_CONFLICT_PAIRS: [string, string][] = [['b5', '#5'], ['b9', '#9']];

interface ChordInspectorModalProps {
  isVisible: boolean;
  onClose: () => void;
  item: SequenceItem | null;
  onSave: (item: SequenceItem) => void;
  onInsert: (item: SequenceItem) => void;
  onDelete: (item: SequenceItem) => void;
  audioEngine: AudioEngine;
  transpositionOffset: number;
}

const ChordInspectorModal: React.FC<ChordInspectorModalProps> = ({ isVisible, onClose, item, onSave, onInsert, onDelete, audioEngine, transpositionOffset }) => {
  const [editedItem, setEditedItem] = useState<SequenceItem | null>(null);
  const [displayedItem, setDisplayedItem] = useState<SequenceItem | null>(null);
  const [isNewChord, setIsNewChord] = useState<boolean>(false);

  const rootNoteSelectRef = useRef<HTMLSelectElement>(null);
  const chordTypeSelectRef = useRef<HTMLSelectElement>(null);
  const bassNoteSelectRef = useRef<HTMLSelectElement>(null);
  const inversionSelectRef = useRef<HTMLSelectElement>(null);
  const chordInspectorPianoRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose]);

  useEffect(() => {
    if (item) {
      const originalItem = JSON.parse(JSON.stringify(item));
      setEditedItem(originalItem);
      setDisplayedItem(transposeChord(originalItem, transpositionOffset));
      setIsNewChord(item.id === undefined);
    } else {
      setEditedItem(null);
      setDisplayedItem(null);
      setIsNewChord(false);
    }
  }, [item, transpositionOffset]);

  useEffect(() => {
    if (editedItem) {
      setDisplayedItem(transposeChord(editedItem, transpositionOffset));
    }
  }, [editedItem, transpositionOffset]);

  // Actualiza selectores y piano cuando cambia displayedItem
  useEffect(() => {
    if (!displayedItem) return;

    const allNotes = [...new Set([...INDEX_TO_SHARP_NAME, ...INDEX_TO_FLAT_NAME])].sort(
      (a, b) => NOTE_TO_INDEX[a] - NOTE_TO_INDEX[b] || a.localeCompare(b)
    );

    if (rootNoteSelectRef.current) {
      populateNoteSelector(rootNoteSelectRef.current, allNotes);
      rootNoteSelectRef.current.value = normalizeNoteToSharp(displayedItem.rootNote);
    }
    if (bassNoteSelectRef.current) {
      populateNoteSelector(bassNoteSelectRef.current, allNotes, true);
      bassNoteSelectRef.current.value = displayedItem.bassNote
        ? normalizeNoteToSharp(displayedItem.bassNote)
        : 'none';
    }
    if (chordTypeSelectRef.current) {
      populateChordTypeSelector(chordTypeSelectRef.current, displayedItem.rootNote, displayedItem.type);
      chordTypeSelectRef.current.value = displayedItem.type;
    }
    if (inversionSelectRef.current) {
      const intervals = MUSICAL_INTERVALS[displayedItem.type];
      const numNotes = intervals ? intervals.length : 0;
      let currentInversion = displayedItem.inversion || 0;
      inversionSelectRef.current.innerHTML = '';
      if (numNotes > 0) {
        for (let i = 0; i < numNotes; i++) {
          const option = document.createElement('option');
          option.value = i.toString();
          option.textContent = i === 0 ? 'Fundamental' : `${i}ª Inversión`;
          inversionSelectRef.current.appendChild(option);
        }
        if (currentInversion >= numNotes) currentInversion = 0;
        inversionSelectRef.current.value = currentInversion.toString();
      }
    }
    if (chordInspectorPianoRef.current) {
      const { notesToPress, bassNoteIndex, allNotesForRange } = getChordNotes(displayedItem);
      if (allNotesForRange.length > 0) {
        const { startNote, endNote } = calculateOptimalPianoRange(allNotesForRange, 15, 2);
        createPiano(chordInspectorPianoRef.current, startNote, endNote, notesToPress, true, bassNoteIndex);
      } else {
        chordInspectorPianoRef.current.innerHTML = '';
      }
    }
  }, [displayedItem]);

  const handleRootNoteChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedItem(p => p ? { ...p, rootNote: e.target.value } : null);
  }, []);

  const handleChordTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedItem(p => p ? { ...p, type: e.target.value, alterations: undefined, additions: undefined, inversion: 0 } : null);
  }, []);

  const handleBassNoteChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedItem(p => p ? { ...p, bassNote: e.target.value === 'none' ? undefined : e.target.value } : null);
  }, []);

  const handleInversionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedItem(p => p ? { ...p, inversion: parseInt(e.target.value, 10) } : null);
  }, []);

  const toggleAddition = useCallback((add: string) => {
    setEditedItem(prev => {
      if (!prev) return null;
      const list = prev.additions ? [...prev.additions] : [];
      const idx = list.indexOf(add);
      if (idx > -1) list.splice(idx, 1); else list.push(add);
      return { ...prev, additions: list.length > 0 ? list : undefined };
    });
  }, []);

  const toggleAlteration = useCallback((alt: string) => {
    setEditedItem(prev => {
      if (!prev) return null;
      const list = prev.alterations ? [...prev.alterations] : [];
      const idx = list.indexOf(alt);
      if (idx > -1) {
        list.splice(idx, 1);
      } else {
        const conflict = ALTERATION_CONFLICT_PAIRS.find(p => p.includes(alt))?.find(p => p !== alt);
        if (conflict) {
          const ci = list.indexOf(conflict);
          if (ci > -1) list.splice(ci, 1);
        }
        list.push(alt);
      }
      return { ...prev, alterations: list.length > 0 ? list : undefined };
    });
  }, []);

  const handlePlayChord = useCallback(() => {
    if (displayedItem) audioEngine.playChord(displayedItem);
  }, [displayedItem, audioEngine]);

  const handleSave = useCallback(() => { if (editedItem) onSave(editedItem); }, [editedItem, onSave]);
  const handleInsert = useCallback(() => { if (editedItem) onInsert(editedItem); }, [editedItem, onInsert]);
  const handleDelete = useCallback(() => { if (editedItem) onDelete(editedItem); }, [editedItem, onDelete]);

  if (!editedItem || !displayedItem) return null;

  return (
    <>
      <div className={`chord-inspector-overlay ${isVisible ? 'visible' : ''}`} onClick={onClose} />
      <div className={`chord-inspector-modal ${isVisible ? 'visible' : ''}`}>
        <div className="inspector-header">
          <span className="inspector-chord-name mr-auto">
            {formatChordName(displayedItem, { style: 'short' })}
          </span>
          <button className="play-btn-modal" onClick={handlePlayChord}>
            <svg className="w-3 h-3 ml-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor">
              <path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/>
            </svg>
          </button>
          <div className="flex gap-2">
            {!isNewChord && <button className="btn-primary-modal" onClick={handleSave}>Guardar</button>}
            {isNewChord  && <button className="btn-primary-modal" onClick={handleInsert}>Insertar</button>}
            {!isNewChord && <button className="btn-delete-modal"  onClick={handleDelete}>Eliminar</button>}
          </div>
          <button className="btn-close-modal" onClick={onClose}>×</button>
        </div>

        <div className="inspector-body">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="selector">
              <label className="selector-label">Nota Raíz</label>
              <select className="selector-box w-full" ref={rootNoteSelectRef} onChange={handleRootNoteChange} />
            </div>
            <div className="selector">
              <label className="selector-label">Tipo de Acorde</label>
              <select className="selector-box w-full" ref={chordTypeSelectRef} onChange={handleChordTypeChange} />
            </div>
            <div className="selector">
              <label className="selector-label">Bajo en (Opcional)</label>
              <select className="selector-box w-full" ref={bassNoteSelectRef} onChange={handleBassNoteChange} />
            </div>
            <div className="selector">
              <label className="selector-label">Inversión</label>
              <select className="selector-box w-full" ref={inversionSelectRef} onChange={handleInversionChange} />
            </div>
          </div>

          <div className="mb-2">
            <label className="selector-label block mb-1">Notas Añadidas</label>
            <div className="flex flex-wrap gap-1.5">
              {EDITABLE_ADDITIONS.map(add => (
                <button
                  key={add}
                  className={`mod-button addition-button${editedItem.additions?.includes(add) ? ' active' : ''}`}
                  onClick={() => toggleAddition(add)}
                >
                  {add.replace('add(', 'add').replace(')', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="selector-label block mb-1">Alteraciones</label>
            <div className="alteraciones flex flex-wrap gap-1.5">
              {EDITABLE_ALTERATIONS.map(alt => (
                <button
                  key={alt}
                  className={`mod-button alteration-button${editedItem.alterations?.includes(alt) ? ' active' : ''}`}
                  onClick={() => toggleAlteration(alt)}
                >
                  {alt}
                </button>
              ))}
            </div>
          </div>

          <div ref={chordInspectorPianoRef} className="flex justify-center inspector-piano-container" />
        </div>
      </div>
    </>
  );
};

export default ChordInspectorModal;
