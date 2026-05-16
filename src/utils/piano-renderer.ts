/*
================================================================================
|                             piano-renderer.ts                                |
|        (Refactorizado para generar selectores de acordes dinámicos)          |
================================================================================
*/

import { CHORD_DISPLAY_LIST, IS_BLACK_KEY, INDEX_TO_SHARP_NAME, INDEX_TO_FLAT_NAME, NOTE_TO_INDEX } from './constants';
import { formatChordName, transposeNote } from './chord-utils';
import type { SongLine, SequenceItem, SongChord } from '../types';

/**
 * Rellena un <select> con opciones de notas musicales.
 */
export function populateNoteSelector(
    selectElement: HTMLSelectElement,
    notesToShow: string[],
    includeEmptyOption: boolean = false,
    emptyOptionText: string = 'Sin Bajo'
): void {
    selectElement.innerHTML = '';

    if (includeEmptyOption) {
        const defaultOption = document.createElement('option');
        defaultOption.value = "none";
        defaultOption.textContent = emptyOptionText;
        selectElement.appendChild(defaultOption);
    }

    const uniqueNotesMap = new Map<number, { sharp: string, flat: string }>();
    notesToShow.forEach(note => {
        const index = NOTE_TO_INDEX[note];
        if (!uniqueNotesMap.has(index)) {
            uniqueNotesMap.set(index, {
                sharp: INDEX_TO_SHARP_NAME[index],
                flat: INDEX_TO_FLAT_NAME[index]
            });
        }
    });

    uniqueNotesMap.forEach(({ sharp, flat }) => {
        const option = document.createElement('option');
        // --- CAMBIO AQUÍ: Se usa la nota 'sharp' como valor para consistencia ---
        if (sharp === flat) {
            option.value = sharp;
            option.textContent = sharp;
        } else {
            option.value = sharp; // Usar C# en lugar de Db como valor, por ejemplo.
            option.textContent = `${sharp} / ${flat}`;
        }
        selectElement.appendChild(option);
    });
}


/**
 * Rellena un <select> con los nombres de acordes completos, basados en una nota raíz.
 */
// --- CAMBIO AQUÍ: La función ahora acepta y usa transpositionOffset ---
export function populateChordTypeSelector(
    selectElement: HTMLSelectElement, 
    rootNote: string,
    defaultValue: string = 'Mayor',
    transpositionOffset: number = 0
): void {
    selectElement.innerHTML = ''; // Limpia opciones anteriores
    
    // La nota raíz usada para los ejemplos debe estar transportada.
    const displayRootNote = transposeNote(rootNote, transpositionOffset);

    CHORD_DISPLAY_LIST.forEach(chordInfo => {
        const option = document.createElement('option');

        if (chordInfo.isSeparator) {
            option.textContent = chordInfo.text;
            option.disabled = true;
            option.classList.add('chord-category-separator');
            option.value = ''; 
        } else {
            option.value = chordInfo.value; 
            // Crear un acorde de ejemplo con la nota raíz transportada
            const tempItem: SequenceItem = { rootNote: displayRootNote, type: chordInfo.value };
            option.textContent = formatChordName(tempItem, { style: 'short' }); 
        }
        
        selectElement.appendChild(option);
    });

    selectElement.value = defaultValue;
}


/**
 * Dibuja el piano en el DOM.
 */
export function createPiano(
    container: HTMLElement, 
    startNote: number, 
    endNote: number, 
    notesToPress: number[], 
    isMini = false, 
    bassNoteIndex: number | null = null,
    onKeyClick?: (noteIndex: number) => void
): void {
    container.innerHTML = ''; 

    const pianoEl = document.createElement('div');
    pianoEl.className = `piano ${isMini ? 'mini-piano' : ''}`;
    pianoEl.setAttribute('aria-label', isMini ? 'Mini piano' : 'Piano virtual');

    for (let i = startNote; i <= endNote; i++) {
        const noteIndexMod = (i % 12 + 12) % 12;
        if (IS_BLACK_KEY[noteIndexMod]) continue;

        const noteName = INDEX_TO_SHARP_NAME[noteIndexMod];
        const whiteKey = document.createElement('div');
        whiteKey.className = 'key white';
        
        const isBassKey = bassNoteIndex !== null && i === bassNoteIndex;
        if (isBassKey) { whiteKey.classList.add('bass-note'); } 
        else if (notesToPress.includes(i)) { whiteKey.classList.add('pressed'); }
        
        if (!isMini) {
            const whiteKeyNameSpan = document.createElement('span');
            whiteKeyNameSpan.className = 'note-name';
            whiteKeyNameSpan.textContent = noteName;
            whiteKey.appendChild(whiteKeyNameSpan);
            if (onKeyClick) {
                whiteKey.addEventListener('click', () => onKeyClick(i));
            }
        }

        const nextNoteIndex = i + 1;
        const nextNoteIndexMod = (nextNoteIndex % 12 + 12) % 12;
        if (nextNoteIndex <= endNote && IS_BLACK_KEY[nextNoteIndexMod]) {
            const blackKey = document.createElement('div');
            blackKey.className = 'key black';
            
            const isBlackBassKey = bassNoteIndex !== null && nextNoteIndex === bassNoteIndex;
            if (isBlackBassKey) { blackKey.classList.add('bass-note'); } 
            else if (notesToPress.includes(nextNoteIndex)) { blackKey.classList.add('pressed'); }

            if (!isMini && onKeyClick) {
                blackKey.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onKeyClick(nextNoteIndex);
                });
            }
            whiteKey.appendChild(blackKey);
        }
        pianoEl.appendChild(whiteKey);
    }
    
    container.appendChild(pianoEl);
}

interface SongSheetCallbacks {
    onShortClick: (item: SequenceItem) => void;
    onLongClick: (item: SequenceItem) => void;
    transposition: number;
}

export function createSongSheet(
    container: HTMLElement,
    lines: SongLine[],
    callbacks: SongSheetCallbacks,
): void {
    container.innerHTML = '';
    container.className = 'song-sheet-container';

    lines.forEach((line, lineIndex) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'song-line';
        lineEl.dataset.lineIndex = lineIndex.toString();

        const chordsLayer = document.createElement('div');
        chordsLayer.className = 'chords-layer';

        const lyricsLayer = document.createElement('div');
        lyricsLayer.className = 'lyrics-layer';
        lyricsLayer.textContent = line.lyrics || '\u00A0';

        line.chords.forEach((songChord: SongChord) => {
            const chord = songChord.chord;
            const position = songChord.position;
            const isAnnotation = songChord.isAnnotation;

            const positionerEl = document.createElement('span');
            positionerEl.className = 'chord-positioner';
            positionerEl.style.left = `${position}ch`;

            const visualEl = document.createElement('span');
            visualEl.className = 'chord-visual';
            visualEl.textContent = formatChordName(chord, { style: 'short' }, callbacks.transposition);
            
            if (isAnnotation) {
                visualEl.classList.add('chord-annotation');
            } else {
                visualEl.classList.add('chord-action');
                if (line.isInstrumental) {
                    visualEl.classList.add('instrumental');
                }

                let clickTimer: number | null = null;
                const longClickDuration = 700;

                visualEl.addEventListener('mousedown', () => {
                    clickTimer = window.setTimeout(() => {
                        callbacks.onLongClick(chord);
                        clickTimer = null;
                    }, longClickDuration);
                });

                const clearTimer = () => {
                    if (clickTimer !== null) {
                        clearTimeout(clickTimer);
                        clickTimer = null;
                    }
                };

                visualEl.addEventListener('mouseup', () => {
                    if (clickTimer !== null) {
                        clearTimeout(clickTimer);
                        callbacks.onShortClick(chord);
                    }
                });

                const globalTooltip = document.getElementById('global-tooltip') as HTMLElement;
                visualEl.addEventListener('mouseenter', () => {
                    const rect = visualEl.getBoundingClientRect();
                    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

                    globalTooltip.textContent = formatChordName(chord, { style: 'long' }, callbacks.transposition);

                    globalTooltip.style.visibility = 'hidden';
                    globalTooltip.style.opacity = '0';
                    globalTooltip.style.left = '0px';
                    globalTooltip.style.top = '0px';
                    globalTooltip.style.transform = 'none';
                    globalTooltip.style.visibility = 'visible';
                    
                    const tooltipWidth = globalTooltip.offsetWidth;
                    const tooltipHeight = globalTooltip.offsetHeight;
                    globalTooltip.style.visibility = 'hidden';

                    let tooltipLeft = rect.left + scrollX + (rect.width / 2);
                    
                    if (tooltipLeft - (tooltipWidth / 2) < 5) {
                        tooltipLeft = (tooltipWidth / 2) + 5;
                    } else if (tooltipLeft + (tooltipWidth / 2) > window.innerWidth - 5) {
                        tooltipLeft = window.innerWidth - (tooltipWidth / 2) - 5;
                    }
                    
                    const tooltipTop = rect.top + scrollY - tooltipHeight - 5;

                    globalTooltip.style.left = `${tooltipLeft}px`;
                    globalTooltip.style.top = `${tooltipTop}px`;
                    globalTooltip.style.transform = 'translateX(-50%)';
                    globalTooltip.style.opacity = '1';
                    globalTooltip.style.visibility = 'visible';
                });

                visualEl.addEventListener('mouseleave', () => {
                    globalTooltip.style.opacity = '0';
                    globalTooltip.style.visibility = 'hidden';
                });

                visualEl.addEventListener('mouseleave', clearTimer);
            }
            
            positionerEl.appendChild(visualEl);
            chordsLayer.appendChild(positionerEl);
        });

        lineEl.appendChild(chordsLayer);
        lineEl.appendChild(lyricsLayer);
        container.appendChild(lineEl);
    });
}
