import type { SequenceItem, ChordSuggestion, ReharmonizationSettings, ChordAnalysis } from '../types';
import { NOTE_TO_INDEX } from './constants';
import { transposeNote, parseChordString, getChordNotes } from './chord-utils';
import { CHORD_TYPE_TO_SCALE, isMajorFamily, isMinorFamily } from './harmony-theory';

export function getMelodyCompatibilityScore(chordType: string, chordRoot: string, melodyNote: string): number {
    if (!melodyNote) return 0;
    const scale = CHORD_TYPE_TO_SCALE[chordType];
    if (!scale) return 0;

    const mIndex = NOTE_TO_INDEX[melodyNote];
    const sRootIndex = NOTE_TO_INDEX[chordRoot];
    if (mIndex === undefined || sRootIndex === undefined) return 0;

    const interval = (mIndex - sRootIndex + 12) % 12;

    if (interval === 4 || interval === 3 || interval === 10 || interval === 11) {
        return 5;
    } else if (scale.includes(interval)) {
        return 3;
    } else {
        return -4;
    }
}

export function scoreByVoiceLeading(
    suggestions: ChordSuggestion[],
    referenceChord: SequenceItem,
    settings: ReharmonizationSettings,
    melodyNote?: string,
    nextChordItem?: SequenceItem
): ChordSuggestion[] {
    const scoreAgainst = (s: ChordSuggestion, target: SequenceItem): number => {
        const targetNotes = getChordNotes(target);
        const targetPitchClasses = new Set(targetNotes.notesToPress.map(n => n % 12));
        const targetRootIndex = NOTE_TO_INDEX[target.rootNote] ?? 0;

        const sNotes = getChordNotes(s.chord);
        const sPitchClasses = new Set(sNotes.notesToPress.map(n => n % 12));
        const commonTones = [...sPitchClasses].filter(n => targetPitchClasses.has(n)).length;
        const sRootIndex = NOTE_TO_INDEX[s.chord.rootNote] ?? 0;

        const rootDist = Math.min(
            (sRootIndex - targetRootIndex + 12) % 12,
            (targetRootIndex - sRootIndex + 12) % 12
        );

        let score = commonTones * 2;

        if (rootDist === 1 || rootDist === 2) score += 2;
        if (rootDist >= 5) score -= 1;

        if (settings.style === 'bolero') {
            const descDist = (targetRootIndex - sRootIndex + 12) % 12;
            if (descDist === 1 || descDist === 2) score += 3;
        }
        if (settings.style === 'gospel') {
            if (rootDist === 5 || rootDist === 7) score += 1;
        }

        return score;
    };

    const scored = suggestions.map(s => {
        let score = scoreAgainst(s, referenceChord);

        if (nextChordItem) {
            const scoreNext = scoreAgainst(s, nextChordItem);
            score = (score * 0.5) + (scoreNext * 0.5);
        }

        let isDissonant = false;
        if (melodyNote) {
            score += getMelodyCompatibilityScore(s.chord.type, s.chord.rootNote, melodyNote);

            const mIndex = NOTE_TO_INDEX[melodyNote];
            const sRootIndex = NOTE_TO_INDEX[s.chord.rootNote];
            if (mIndex !== undefined && sRootIndex !== undefined) {
                const interval = (mIndex - sRootIndex + 12) % 12;
                if (interval === 1 || interval === 13 % 12) {
                    isDissonant = true;
                }
            }
        }

        return { s, score, isDissonant };
    });

    const filtered = scored.filter(item => {
        if (item.isDissonant) {
            if (settings.density !== 'high') return false;
            item.s.justification += ' (Tensión intencional contra la melodía).';
        }
        return true;
    });

    return filtered.sort((a, b) => b.score - a.score).map(item => item.s);
}

export function getInversionSuggestions(chord: ChordAnalysis, settings: ReharmonizationSettings, nextChordItem?: SequenceItem): ChordSuggestion[] {
    const suggestions: ChordSuggestion[] = [];
    const isMajor = isMajorFamily(chord.type);
    const isMinor = isMinorFamily(chord.type);
    const func = chord.analysis?.func;

    if (isMajor || isMinor) {
        const thirdInterval = isMajor ? 4 : 3;
        const thirdNote = transposeNote(chord.rootNote, thirdInterval);
        const inv = parseChordString(`${chord.rootNote}${chord.type}/${thirdNote}`);
        if (inv) suggestions.push({ chord: inv, technique: 'Primera Inversión', justification: 'Línea de bajo melódica hacia el acorde siguiente.' });
    }

    if (func === 'Tonic' || func === 'Subdominant') {
        const fifthNote = transposeNote(chord.rootNote, 7);
        const inv = parseChordString(`${chord.rootNote}${chord.type}/${fifthNote}`);
        if (inv) suggestions.push({ chord: inv, technique: 'Segunda Inversión', justification: 'Acorde en cuarta y sexta, estable.' });
    }

    if (chord.type.includes('7') || chord.type.includes('maj7')) {
        let seventhInt = 10;
        if (chord.type.includes('maj7')) seventhInt = 11;
        const seventhNote = transposeNote(chord.rootNote, seventhInt);
        const inv = parseChordString(`${chord.rootNote}${chord.type}/${seventhNote}`);
        if (inv) suggestions.push({ chord: inv, technique: 'Inversión en 7ma', justification: 'Línea de bajo descendente suave.' });
    }

    if (settings.style === 'gospel' && func === 'Tonic' && chord.analysis?.roman === 'I') {
        const ivRoot = transposeNote(chord.rootNote, 5);
        const inv = parseChordString(`${ivRoot}/${chord.rootNote}`);
        if (inv) suggestions.push({ chord: inv, technique: 'Inversión Gospel', justification: 'IV con bajo en I.' });
    }

    if (settings.style === 'bolero' && nextChordItem) {
        const nextRootIndex = NOTE_TO_INDEX[nextChordItem.rootNote];
        if (nextRootIndex !== undefined) {
            const intervals = [
                { name: '3ra', int: isMajor ? 4 : 3 },
                { name: '5ta', int: 7 },
                { name: '7ma', int: chord.type.includes('maj7') ? 11 : 10 }
            ];

            for (const inv of intervals) {
                const bassNoteIndex = (NOTE_TO_INDEX[chord.rootNote]! + inv.int) % 12;
                const dist = (bassNoteIndex - nextRootIndex + 12) % 12;
                if (dist === 1 || dist === 11) {
                    const bassNote = transposeNote(chord.rootNote, inv.int);
                    const invChord = parseChordString(`${chord.rootNote}${chord.type}/${bassNote}`);
                    if (invChord) suggestions.push({ chord: invChord, technique: 'Inversión Bolero', justification: `Bajo en ${inv.name} conecta cromáticamente con el siguiente acorde.` });
                }
            }
        }
    }

    return suggestions;
}
