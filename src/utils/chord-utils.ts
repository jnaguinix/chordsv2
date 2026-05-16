import {
    NOTE_TO_INDEX,
    INDEX_TO_SHARP_NAME,
    INDEX_TO_FLAT_NAME,
    NOTE_NAME_SPANISH,
    MUSICAL_INTERVALS,
    CHORD_TYPE_MAP,
    CHORD_TYPE_TO_READABLE_NAME,
    CHORD_TYPE_TO_SHORT_SYMBOL
} from './constants';
import type { SequenceItem } from '../types';

const ALTERATION_MAP: { [key:string]: { degree: number, change: number } } = {
    'b5': { degree: 5, change: -1 }, '#5': { degree: 5, change: 1 },
    'b9': { degree: 9, change: -1 }, '#9': { degree: 9, change: 1 },
    '#11': { degree: 11, change: 1 }, 'b13': { degree: 13, change: -1 }
};

const ADDITION_MAP: { [key:string]: { degree: number } } = {
    'add(2)': { degree: 2 },
    'add(4)': { degree: 4 },
    'add(6)': { degree: 6 },
    'add(9)': { degree: 9 },
    'add(11)': { degree: 11 },
    'add(13)': { degree: 13 }
};

const DEGREE_TO_INTERVAL: { [key:number]: number } = {
    1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21
};

const SUPERSCRIPT_TO_NUMBER: { [key:string]: number } = { '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
const NUMBER_TO_SUPERSCRIPT: { [key:number]: string } = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

export function normalizeNoteToSharp(note: string): string {
    const index = NOTE_TO_INDEX[note];
    return index !== undefined ? INDEX_TO_SHARP_NAME[index] : note;
}

export function transposeNote(note: string, semitones: number): string {
    const currentIndex = NOTE_TO_INDEX[note];
    if (currentIndex === undefined) return note;
    const newIndex = (currentIndex + semitones % 12 + 12) % 12;
    const useFlats = (note.includes('b') && note.length > 1) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(note);
    return useFlats ? INDEX_TO_FLAT_NAME[newIndex] : INDEX_TO_SHARP_NAME[newIndex];
}

export function transposeChord(item: SequenceItem, semitones: number): SequenceItem {
    const transposedItem = { ...item };
    transposedItem.rootNote = transposeNote(item.rootNote, semitones);
    if (item.bassNote) {
        transposedItem.bassNote = transposeNote(item.bassNote, semitones);
    }
    return transposedItem;
}

export function getChordNotes(item: SequenceItem, transpositionOffset: number = 0): { notesToPress: number[], bassNoteIndex: number | null, allNotesForRange: number[] } {
    if (!item.rootNote || !item.type) {
        return { notesToPress: [], bassNoteIndex: null, allNotesForRange: [] };
    }
    const transposedRootNote = transposeNote(item.rootNote, transpositionOffset);
    const rootNoteIndex = NOTE_TO_INDEX[transposedRootNote];
    const baseIntervals = MUSICAL_INTERVALS[item.type];
    if (rootNoteIndex === undefined || !baseIntervals) {
        return { notesToPress: [], bassNoteIndex: null, allNotesForRange: [] };
    }
    const chordBaseAbsoluteIndex = rootNoteIndex + 12 * 3;
    let fundamentalChordNotes = baseIntervals.map((interval: number) => chordBaseAbsoluteIndex + interval);
    if (item.alterations) {
        item.alterations.forEach((alt: string) => {
            const alterationInfo = ALTERATION_MAP[alt];
            if (!alterationInfo) return;
            const baseInterval = DEGREE_TO_INTERVAL[alterationInfo.degree];
            let noteToAlterIndex = fundamentalChordNotes.findIndex(note => (note - chordBaseAbsoluteIndex) % 12 === baseInterval % 12);
            if (noteToAlterIndex !== -1) {
                fundamentalChordNotes[noteToAlterIndex] += alterationInfo.change;
            } else {
                fundamentalChordNotes.push(chordBaseAbsoluteIndex + baseInterval + alterationInfo.change);
            }
        });
    }
    if (item.additions) {
        item.additions.forEach((add: string) => {
            const additionInfo = ADDITION_MAP[add as keyof typeof ADDITION_MAP];
            if (!additionInfo) return;
            const intervalToAdd = DEGREE_TO_INTERVAL[additionInfo.degree];
            fundamentalChordNotes.push(chordBaseAbsoluteIndex + intervalToAdd);
        });
    }
    fundamentalChordNotes = [...new Set(fundamentalChordNotes)].sort((a, b) => a - b);

    let bassAbsoluteIndex: number | null = null;
    const transposedBassNote = item.bassNote ? transposeNote(item.bassNote, transpositionOffset) : transposedRootNote;
    const bassNoteIndexMod12 = NOTE_TO_INDEX[transposedBassNote];
    if (bassNoteIndexMod12 !== undefined) {
        const lowestFundamentalNote = Math.min(...fundamentalChordNotes);
        let tempBassIndex = bassNoteIndexMod12 + (Math.floor(lowestFundamentalNote / 12)) * 12;
        if (tempBassIndex >= lowestFundamentalNote) {
            tempBassIndex -= 12;
        }
        bassAbsoluteIndex = tempBassIndex;
    }

    let chordAbsoluteIndices = [...fundamentalChordNotes];
    if (item.inversion && item.inversion > 0) {
        for (let i = 0; i < item.inversion; i++) {
            const lowestNote = chordAbsoluteIndices.shift();
            if (lowestNote !== undefined) chordAbsoluteIndices.push(lowestNote + 12);
            chordAbsoluteIndices.sort((a, b) => a - b);
        }
    }

    const allNotesForRange = [...new Set([...chordAbsoluteIndices, ...(bassAbsoluteIndex !== null ? [bassAbsoluteIndex] : [])])];
    return { notesToPress: chordAbsoluteIndices, bassNoteIndex: bassAbsoluteIndex, allNotesForRange };
}

export function parseChordString(chord: string): SequenceItem | null {
    let sanitizedChord = chord.trim();
    if (!sanitizedChord || sanitizedChord === '%' || sanitizedChord === '|') return null;
    if (sanitizedChord.startsWith('(') && sanitizedChord.endsWith(')')) return null;

    let bassNote: string | undefined;
    let mainPart = sanitizedChord;

    const bassMatch = mainPart.match(/\/([A-G][#b]?)$/);
    if (bassMatch && bassMatch[0]) {
        bassNote = bassMatch[1];
        mainPart = mainPart.substring(0, mainPart.length - bassMatch[0].length);
    }

    const rootMatch = mainPart.match(/^[A-G][#b]?/);
    if (!rootMatch) return null;
    const rootNote = rootMatch[0];

    let suffix = mainPart.substring(rootNote.length).trim();

    if (NOTE_TO_INDEX[rootNote] === undefined || (bassNote && NOTE_TO_INDEX[bassNote] === undefined)) {
        return null;
    }

    const cleanSuffix = suffix.replace(/[()]/g, '');
    const sortedSuffixes = Object.keys(CHORD_TYPE_MAP).sort((a, b) => b.length - a.length);
    let foundType: string | null = null;
    let foundSuffix = '';

    for (const mapSuffix of sortedSuffixes) {
        if (cleanSuffix.startsWith(mapSuffix)) {
            foundType = CHORD_TYPE_MAP[mapSuffix];
            foundSuffix = mapSuffix;
            break;
        }
    }

    if (foundType === null) return null;

    let remainingSuffix = cleanSuffix.substring(foundSuffix.length);

    const alterations: string[] = [];
    const additions: string[] = [];

    const modificationRegex = /([#b-])(\d+)|(add)(\d+)|(\+)/g;
    const unprocessedSuffix = remainingSuffix.replace(modificationRegex, (_match, p1, p2, p3, p4, p5) => {
        if (p3 === 'add' && p4) {
            additions.push(`add(${p4})`);
        } else if (p5 === '+') {
            alterations.push('#5');
        } else if (p1 && p2) {
            const symbol = p1 === '-' ? 'b' : p1;
            alterations.push(`${symbol}${p2}`);
        }
        return '';
    });

    let inversion: number | undefined;
    if (unprocessedSuffix.length > 0) {
        const potentialInversionInt = parseInt(unprocessedSuffix, 10);
        const potentialInversionSup = SUPERSCRIPT_TO_NUMBER[unprocessedSuffix];

        if (!isNaN(potentialInversionInt) && potentialInversionInt.toString() === unprocessedSuffix) {
            inversion = potentialInversionInt;
        } else if (potentialInversionSup) {
            inversion = potentialInversionSup;
        } else {
            return null;
        }
    }

    return {
        raw: chord,
        rootNote,
        type: foundType,
        bassNote,
        inversion,
        alterations: alterations.length > 0 ? alterations : undefined,
        additions: additions.length > 0 ? additions : undefined
    };
}

export function formatChordName(item: SequenceItem, options: { style: 'short' | 'long' }, transpositionOffset: number = 0): string {
    if (!item || !item.rootNote || !item.type) return item?.raw || '';
    if (item.raw === '%' || item.raw === '|') return item.raw;

    const root = transposeNote(item.rootNote, transpositionOffset);
    const bass = item.bassNote ? transposeNote(item.bassNote, transpositionOffset) : null;

    if (options.style === 'short') {
        let suffix = CHORD_TYPE_TO_SHORT_SYMBOL[item.type] ?? '';

        const allMods: string[] = [];
        if (item.alterations) {
            allMods.push(...item.alterations);
        }
        if (item.additions) {
            allMods.push(...item.additions.map(a => a.replace(/[()]/g, '')));
        }

        let modificationsString = '';
        if (allMods.length > 0) {
            const sortedMods = allMods.sort((a, b) => parseInt(a.replace(/[^0-9]/g, ''), 10) - parseInt(b.replace(/[^0-9]/g, ''), 10));

            if (sortedMods.length === 1 && sortedMods[0].startsWith('add')) {
                modificationsString = sortedMods[0];
            } else {
                modificationsString = `(${sortedMods.join('')})`;
            }
        }

        let displayName = root + suffix + modificationsString;

        if (item.inversion && item.inversion > 0 && NUMBER_TO_SUPERSCRIPT[item.inversion]) {
            displayName += NUMBER_TO_SUPERSCRIPT[item.inversion];
        }

        if (bass && bass !== root) {
            displayName += `/${bass}`;
        }

        return displayName;
    }

    if (options.style === 'long') {
        const rootNoteName = NOTE_NAME_SPANISH[root] || root;
        const chordTypeName = CHORD_TYPE_TO_READABLE_NAME[item.type] || item.type;

        let displayName = `${rootNoteName} ${chordTypeName}`;

        if (item.alterations && item.alterations.length > 0) {
            displayName += ` con alteraciones (${item.alterations.join(', ')})`;
        }
        if (item.additions && item.additions.length > 0) {
            displayName += ` con notas añadidas (${item.additions.join(', ')})`;
        }
        if (bass && bass !== root) {
            const bassNoteName = NOTE_NAME_SPANISH[bass] || bass;
            displayName += ` con bajo en ${bassNoteName}`;
        }
        if (item.inversion && item.inversion > 0) {
            displayName += ` (${item.inversion}ª Inversión)`;
        }
        return displayName;
    }

    return '';
}

export function calculateOptimalPianoRange(allNotes: number[], minWhiteKeys: number = 20, horizontalPaddingSemitones: number = 5): { startNote: number; endNote: number } {
    if (allNotes.length === 0) return { startNote: 48, endNote: 83 };
    const minNote = Math.min(...allNotes);
    const maxNote = Math.max(...allNotes);
    let startNote = minNote - horizontalPaddingSemitones;
    let endNote = maxNote + horizontalPaddingSemitones;
    const requiredSemitoneSpan = Math.ceil(minWhiteKeys * (12 / 7));
    const currentSemitoneSpan = endNote - startNote;
    if (currentSemitoneSpan < requiredSemitoneSpan) {
        const centerPoint = Math.round((minNote + maxNote) / 2);
        startNote = centerPoint - Math.ceil(requiredSemitoneSpan / 2);
        endNote = centerPoint + Math.floor(requiredSemitoneSpan / 2);
    }
    const PIANO_MIN_MIDI = 21;
    const PIANO_MAX_MIDI = 108;
    return {
        startNote: Math.max(PIANO_MIN_MIDI, Math.round(startNote)),
        endNote: Math.min(PIANO_MAX_MIDI, Math.round(endNote)),
    };
}
