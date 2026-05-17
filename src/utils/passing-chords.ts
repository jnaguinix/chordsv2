import type { SequenceItem, DetectedKey, ChordSuggestion, ReharmonizationSettings, ChordAnalysis } from '../types';
import { NOTE_TO_INDEX, INDEX_TO_SHARP_NAME } from './constants';
import { transposeNote, parseChordString, formatChordName, getChordNotes } from './chord-utils';
import {
    MAJOR_SCALE_INTERVALS, MINOR_SCALE_INTERVALS,
    isMinorFamily, isDominantFamily, isMajorFamily,
    analyzeChordContext,
} from './harmony-theory';

export function getSecondaryDominants(nextChord: ChordAnalysis, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!nextChord.analysis || ['I', 'i', 'vii°'].includes(nextChord.analysis.roman)) return [];

    const targetRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
    if (targetRootIndex === undefined) return [];

    const dominantRoot = transposeNote(INDEX_TO_SHARP_NAME[targetRootIndex], 7);
    let dominantType = '7';
    const isTargetMinor = isMinorFamily(nextChord.type);

    if (settings.style === 'bolero') {
        dominantType = '7b9';
    } else if (settings.style === 'jazz' || settings.style === 'neo-soul') {
        if (settings.density === 'high') {
            dominantType = isTargetMinor ? '7alt' : '13';
        } else {
            dominantType = isTargetMinor ? '7b9' : '9';
        }
    } else {
        dominantType = isTargetMinor ? '7b9#5' : '9';
    }

    const dominantChord = parseChordString(`${dominantRoot}${dominantType}`);
    const suggestions: ChordSuggestion[] = [];

    if (dominantChord) {
        suggestions.push({
            chord: dominantChord,
            technique: 'Dominante Secundario',
            justification: `Prepara el acorde destino (${dominantType} para estilo ${settings.style}).`
        });

        if (nextChord.analysis.func === 'Dominant') {
            const vOfVRoot = transposeNote(dominantRoot, 7);
            const vOfVType = (settings.style === 'jazz' || settings.style === 'neo-soul') ? (settings.density === 'high' ? '13' : '9') : '9';
            const vOfVChord = parseChordString(`${vOfVRoot}${vOfVType}`);
            if (vOfVChord) {
                suggestions.push({
                    chord: vOfVChord,
                    chords: [vOfVChord, dominantChord],
                    technique: 'V/V - Dominante del Dominante',
                    justification: `Prepara el dominante con su propio dominante encadenado.`
                });
            }
        }
    }
    return suggestions;
}

export function getFullTwoFiveOne(targetChord: ChordAnalysis, _key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!targetChord.analysis || ['vii°'].includes(targetChord.analysis.roman)) return [];

    const targetRootIndex = NOTE_TO_INDEX[targetChord.rootNote];
    if (targetRootIndex === undefined) return [];

    const isTargetMinor = isMinorFamily(targetChord.type);

    const iiRoot = transposeNote(targetChord.rootNote, 2);
    const iiType = isTargetMinor ? 'm7b5' : 'm7';
    const iiChord = parseChordString(`${iiRoot}${iiType}`);

    const vRoot = transposeNote(targetChord.rootNote, 7);
    let vType = '7';
    if (settings.style === 'bolero') {
        vType = '7b9';
    } else if (settings.style === 'jazz' || settings.style === 'neo-soul') {
        vType = isTargetMinor ? (settings.density === 'high' ? '7alt' : '7b9') : (settings.density === 'high' ? '13' : '9');
    } else {
        vType = isTargetMinor ? '7b9#5' : '9';
    }
    const vChord = parseChordString(`${vRoot}${vType}`);

    if (iiChord && vChord) {
        return [{
            chord: iiChord,
            chords: [iiChord, vChord],
            technique: 'Cadencia ii-V-I',
            justification: `Bloque armónico que prepara fuertemente la llegada a ${formatChordName(targetChord, { style: 'short' })}.`
        }];
    }

    return [];
}

export function getBassLineMelodicPassing(prevChord: ChordAnalysis, nextChord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
    const suggestions: ChordSuggestion[] = [];
    const prevRootIndex = NOTE_TO_INDEX[prevChord.rootNote];
    const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
    if (prevRootIndex === undefined || nextRootIndex === undefined) return [];

    const scaleIntervals = key.scale === 'Major' ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
    const keyRootIndex = NOTE_TO_INDEX[key.key];

    const ascDist = (nextRootIndex - prevRootIndex + 12) % 12;
    const descDist = (prevRootIndex - nextRootIndex + 12) % 12;

    if (ascDist === 5 && isMajorFamily(prevChord.type)) {
        const thirdOfPrev = transposeNote(prevChord.rootNote, 4);
        const passingChord = parseChordString(`${prevChord.rootNote}/${thirdOfPrev}`);
        if (passingChord) {
            suggestions.push({ chord: passingChord, technique: 'Bajo Melódico Escalar', justification: `Línea de bajo ascendente: ${prevChord.rootNote}–${thirdOfPrev}–${nextChord.rootNote}.` });
        }
    }

    if (descDist === 5) {
        const stepDown = transposeNote(prevChord.rootNote, -2);
        const stepDownIndex = NOTE_TO_INDEX[stepDown];
        if (stepDownIndex !== undefined) {
            const intervalFromKey = (stepDownIndex - keyRootIndex + 12) % 12;
            const degreeIndex = scaleIntervals.indexOf(intervalFromKey);
            if (degreeIndex !== -1) {
                const isDiatMinor = [1, 2, 5].includes(degreeIndex);
                const passingType = isDiatMinor ? 'm7' : '7';
                const passingChord = parseChordString(`${stepDown}${passingType}`);
                if (passingChord) {
                    suggestions.push({ chord: passingChord, technique: 'Bajo Melódico Escalar', justification: `Línea de bajo descendente hacia ${nextChord.rootNote}.` });
                }
            }
        }
    }

    if (ascDist === 3) {
        const stepUp = transposeNote(prevChord.rootNote, 2);
        const stepUpIndex = NOTE_TO_INDEX[stepUp];
        if (stepUpIndex !== undefined) {
            const intervalFromKey = (stepUpIndex - keyRootIndex + 12) % 12;
            const degreeIndex = scaleIntervals.indexOf(intervalFromKey);
            if (degreeIndex !== -1) {
                const passingType = [1, 2, 5].includes(degreeIndex) ? 'm7' : 'maj7';
                const passingChord = parseChordString(`${stepUp}${passingType}`);
                if (passingChord) {
                    suggestions.push({ chord: passingChord, technique: 'Bajo Melódico Escalar', justification: `Rellena la 3ª menor.` });
                }
            }
        }
    }

    if (ascDist === 4) {
        const stepUp = transposeNote(prevChord.rootNote, 2);
        const stepUpIndex = NOTE_TO_INDEX[stepUp];
        if (stepUpIndex !== undefined) {
            const intervalFromKey = (stepUpIndex - keyRootIndex + 12) % 12;
            const degreeIndex = scaleIntervals.indexOf(intervalFromKey);
            if (degreeIndex !== -1) {
                const passingType = [1, 2, 5].includes(degreeIndex) ? 'm7' : 'maj7';
                const passingChord = parseChordString(`${stepUp}${passingType}`);
                if (passingChord) {
                    suggestions.push({ chord: passingChord, technique: 'Bajo Melódico Escalar', justification: `Rellena la 3ª mayor.` });
                }
            }
        }
    }

    return suggestions;
}

export function getBackdoorPassing(_prevChord: ChordAnalysis, nextChord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!nextChord.analysis) return [];
    const suggestions: ChordSuggestion[] = [];
    const keyRootIndex = NOTE_TO_INDEX[key.key];
    if (keyRootIndex === undefined) return [];

    const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
    const isDestinationTonic =
        (nextChord.analysis.roman === 'I' || nextChord.analysis.roman === 'i') &&
        isMajorFamily(nextChord.type);

    if (isDestinationTonic && nextRootIndex !== undefined) {
        const minorFourthRoot = transposeNote(key.key, 5);
        const backdoorTwo = parseChordString(`${minorFourthRoot}m7`);
        if (backdoorTwo) {
            suggestions.push({ chord: backdoorTwo, technique: 'Backdoor ii-V', justification: `ivm7 inicia el camino backdoor.` });
        }

        const backdoorDominantRoot = transposeNote(key.key, 10);
        const backdoorDominant = parseChordString(`${backdoorDominantRoot}7`);
        if (backdoorDominant) {
            suggestions.push({ chord: backdoorDominant, technique: 'Backdoor ii-V', justification: `bVII7 resuelve suave.` });
        }
    }

    return suggestions;
}

export function getCommonToneSubstitutions(chord: ChordAnalysis, key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    const suggestions: ChordSuggestion[] = [];
    if (settings.density === 'low') return [];

    const refNotes = getChordNotes(chord);
    if (refNotes.notesToPress.length === 0) return [];
    const refPitchClasses = new Set(refNotes.notesToPress.map(n => n % 12));

    if (chord.analysis?.roman === 'I' && key.scale === 'Major') {
        const thirdRoot = transposeNote(chord.rootNote, 4);
        const sixthRoot = transposeNote(chord.rootNote, 9);
        const c1 = parseChordString(`${thirdRoot}m7`);
        if (c1) suggestions.push({ chord: c1, technique: 'Expansión de Tónica', justification: 'Construido en la 3ra del I' });
        const c2 = parseChordString(`${sixthRoot}m7`);
        if (c2) suggestions.push({ chord: c2, technique: 'Expansión de Tónica', justification: 'Construido en la 6ta del I' });
    }

    const commonTypes = ['maj7', 'm7', '7', 'dim7', '6'];
    let matches = 0;
    for (let i = 0; i < 12; i++) {
        const root = INDEX_TO_SHARP_NAME[i];
        if (root === chord.rootNote) continue;
        for (const type of commonTypes) {
            const testChord = parseChordString(`${root}${type}`);
            if (!testChord) continue;

            const testAnalysis = analyzeChordContext(testChord, key);
            if (testAnalysis?.analysis && chord.analysis) {
                const testFunc = testAnalysis.analysis.func;
                const origFunc = chord.analysis.func;
                if (origFunc === 'Tonic' && !['Tonic', 'Transition'].includes(testFunc)) continue;
                if (origFunc === 'Subdominant' && !['Subdominant', 'Transition'].includes(testFunc)) continue;
                if (origFunc === 'Dominant' && !['Dominant', 'Transition'].includes(testFunc)) continue;
            }

            const testNotes = getChordNotes(testChord);
            const testPitchClasses = new Set(testNotes.notesToPress.map(n => n % 12));
            const intersection = [...testPitchClasses].filter(n => refPitchClasses.has(n));
            if (intersection.length >= 3 && matches < 5) {
                const notesShared = intersection.map(n => INDEX_TO_SHARP_NAME[n]).join(', ');
                suggestions.push({
                    chord: testChord,
                    technique: 'Intercambiable por Nota Común',
                    justification: `Comparte ${intersection.length} notas (${notesShared}). Función mantenida.`
                });
                matches++;
            }
        }
    }
    return suggestions;
}
