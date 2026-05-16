import React, { useRef, useEffect } from 'react';
import type { SequenceItem } from '../types';
import { createPiano } from '../utils/piano-renderer';
import { getChordNotes, calculateOptimalPianoRange } from '../utils/chord-utils';

interface PianoDisplayProps {
  chord: SequenceItem | null;
  transpositionOffset: number;
}

const PianoDisplay: React.FC<PianoDisplayProps> = ({ chord, transpositionOffset }) => {
  const pianoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pianoRef.current) return;

    if (chord) {
      // El acorde que llega ya está listo para ser mostrado.
      // Se pasa un offset de 0 para que no se vuelva a transportar.
      const { notesToPress, bassNoteIndex, allNotesForRange } = getChordNotes(chord, transpositionOffset);
      if (allNotesForRange.length > 0) {
        const { startNote, endNote } = calculateOptimalPianoRange(allNotesForRange, 25, 4);
        createPiano(pianoRef.current, startNote, endNote, notesToPress, true, bassNoteIndex);
      } else {
        createPiano(pianoRef.current, 48, 72, [], true, null);
      }
    } else {
      createPiano(pianoRef.current, 48, 72, [], true, null);
    }
  }, [chord, transpositionOffset]);

  return (
    <div className="piano-display-container">
      <div ref={pianoRef} className="interactive-piano"></div>
    </div>
  );
};

export default PianoDisplay;
