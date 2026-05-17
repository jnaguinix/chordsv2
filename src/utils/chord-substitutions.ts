import type { DetectedKey, ChordSuggestion, ReharmonizationSettings, ChordAnalysis } from '../types';
import { transposeNote, parseChordString, formatChordName } from './chord-utils';
import {
    MAJOR_SCALE_DEGREES, MINOR_SCALE_DEGREES,
    MAJOR_SCALE_INTERVALS, MINOR_SCALE_INTERVALS,
    isMinorFamily, isDominantFamily, isMajorFamily,
    chordHasInterval,
} from './harmony-theory';

export function getDiatonicSubstitutions(chord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!chord.analysis) return [];
    const suggestions: ChordSuggestion[] = [];
    const { func, roman } = chord.analysis;

    const addSuggestion = (targetRoman: string, type: string, justification: string, bassNote?: string) => {
        const isMajorScale = key.scale === 'Major';
        const scaleDegrees = isMajorScale ? MAJOR_SCALE_DEGREES : MINOR_SCALE_DEGREES;
        const scaleIntervals = isMajorScale ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;

        const degreeIndex = scaleDegrees.indexOf(targetRoman);
        if (degreeIndex === -1) return;

        const rootNote = transposeNote(key.key, scaleIntervals[degreeIndex]);
        let chordString = `${rootNote}${type}`;
        if (bassNote) chordString += `/${bassNote}`;

        const newChord = parseChordString(chordString);
        if (newChord && formatChordName(newChord, { style: 'short' }) !== formatChordName(chord, { style: 'short' })) {
            suggestions.push({ chord: newChord, technique: 'Sustitución Diatónica', justification });
        }
    };

    if (func === 'Tonic' && key.scale === 'Major') {
        if (roman === 'I') {
            const third = transposeNote(chord.rootNote, 4);
            addSuggestion('I', 'maj7', '1ra Inversión (Bajo melódico)', third);
        }
        if (roman !== 'iii') addSuggestion('iii', 'm7', 'Sustituto de tónica (relativo)');
        if (roman !== 'vi') addSuggestion('vi', 'm7', 'Sustituto de tónica (relativo)');
    }
    if (func === 'Subdominant' && key.scale === 'Major') {
        if (roman !== 'ii') addSuggestion('ii', 'm7', 'Sustituto de subdominante (relativo)');
    }
    if (func === 'Dominant' && key.scale === 'Major' && roman === 'V') {
        const third = transposeNote(chord.rootNote, 4);
        addSuggestion('V', '7', '1ra Inversión (conduce al I)', third);
    }

    return suggestions;
}

export function getTritoneSubstitution(chord: ChordAnalysis, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!chordHasInterval(chord, 10)) return [];
    if (!chordHasInterval(chord, 4)) return [];
    if (!chord.analysis || chord.analysis.func !== 'Dominant') return [];

    const tritoneRoot = transposeNote(chord.rootNote, 6);
    const tritoneType = settings.style === 'jazz' || settings.style === 'neo-soul' ? '7alt' : '7';
    const tritoneChord = parseChordString(`${tritoneRoot}${tritoneType}`);

    if (tritoneChord) {
        return [{
            chord: tritoneChord,
            technique: 'Sustitución de Tritono',
            justification: `Crea una línea de bajo cromática.`
        }];
    }
    return [];
}

export function getModalInterchange(chord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!chord.analysis) return [];
    const suggestions: ChordSuggestion[] = [];
    const { roman } = chord.analysis;
    const keyRoot = key.key;

    const addSugg = (r: number, type: string, justification: string) => {
        const root = transposeNote(keyRoot, r);
        const c = parseChordString(`${root}${type}`);
        if (c) suggestions.push({ chord: c, technique: 'Intercambio Modal', justification });
    };

    if (key.scale === 'Minor') {
        if (roman === 'i') addSugg(0, 'maj7', 'Imaj7 prestado de Mayor paralela.');
        if (roman === 'iv') {
            addSugg(5, 'Mayor', 'IV mayor prestado de Dórico — sonido neo-soul característico.');
            addSugg(5, 'maj7', 'IVmaj7 prestado de Dórico — color más rico.');
        }
        if (roman === 'bVII') addSugg(10, 'maj7#11', 'bVIImaj7#11 prestado de Lidio.');
        if (roman === 'bVI') addSugg(8, '6/9', 'bVI6/9 color sofisticado.');
        if (roman === 'ii°') addSugg(2, 'm11b5', 'iim11b5 extensión moderna del semidisminuido.');
    } else {
        if (roman === 'I') addSugg(0, 'm7', 'im7 prestado de Menor paralela (R&B/Gospel).');
        if (roman === 'ii') {
            addSugg(2, '°7', 'ii°7 prestado de menor.');
            addSugg(2, 'm7b5', 'iim7b5 prestado de menor.');
        }
        if (roman === 'vi') addSugg(8, 'maj7', 'bVI mayor prestado de menor (color R&B/Gospel).');
        if (roman === 'IV') addSugg(5, 'm7', 'Acorde "prestado" de la tonalidad menor (ivm7).');
        if (roman === 'V') {
            addSugg(10, '7', 'Dominante "Backdoor" (bVII7), resolución suave al I.');
            addSugg(8, 'maj7', 'Resolución deceptiva (bVImaj7), sonido sofisticado.');
        }
    }

    return suggestions;
}

export function getThirdRelationSubstitutions(chord: ChordAnalysis, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (settings.density === 'low') return [];
    if (isDominantFamily(chord.type) || chord.analysis?.func === 'Dominant') return [];

    const suggestions: ChordSuggestion[] = [];

    const up4 = transposeNote(chord.rootNote, 4);
    const up3 = transposeNote(chord.rootNote, 3);
    const down4 = transposeNote(chord.rootNote, -4);

    const c1 = parseChordString(`${up4}${chord.type}`);
    if (c1) suggestions.push({ chord: c1, technique: 'Relación de 3ras', justification: 'Sustituto a 3ra mayor ascendente — color Collier/jazz moderno.' });

    const c2 = parseChordString(`${up3}${chord.type}`);
    if (c2) suggestions.push({ chord: c2, technique: 'Relación de 3ras', justification: 'Sustituto a 3ra menor ascendente — movimiento cromático suave.' });

    const c3 = parseChordString(`${down4}${chord.type}`);
    if (c3) suggestions.push({ chord: c3, technique: 'Relación de 3ras', justification: 'Sustituto a 3ra mayor descendente.' });

    return suggestions;
}

export function getCircleOfFifthsCadence(chord: ChordAnalysis, key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (settings.style !== 'bolero' && settings.style !== 'jazz') return [];
    if (chord.analysis?.roman !== 'I' && chord.analysis?.roman !== 'i') return [];

    const viRoot = transposeNote(key.key, 9);
    const iiRoot = transposeNote(key.key, 2);
    const vRoot = transposeNote(key.key, 7);

    const typeVI = settings.style === 'bolero' ? '7b9' : '13';
    const typeII = settings.style === 'bolero' ? '7b9' : '9';
    const typeV = settings.style === 'bolero' ? '7b9' : '13';

    const viChord = parseChordString(`${viRoot}${typeVI}`);
    const iiChord = parseChordString(`${iiRoot}${typeII}`);
    const vChord = parseChordString(`${vRoot}${typeV}`);

    if (viChord && iiChord && vChord) {
        return [{
            chord: viChord,
            chords: [viChord, iiChord, vChord],
            technique: 'Círculo de Quintas (I-VI-II-V)',
            justification: 'Cadencia completa del bolero/jazz clásico — resuelve de vuelta al I.'
        }];
    }
    return [];
}
