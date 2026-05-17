import type { DetectedKey, ChordSuggestion, ReharmonizationSettings, ChordAnalysis } from '../types';
import { transposeNote, parseChordString } from './chord-utils';
import { isMinorFamily, isDominantFamily, isMajorFamily, chordHasInterval } from './harmony-theory';

export function getStyledVoicings(chord: ChordAnalysis, _settings: ReharmonizationSettings): ChordSuggestion[] {
    if (!chord.analysis) return [];
    const suggestions: ChordSuggestion[] = [];
    const { roman } = chord.analysis;

    const dominantDegrees = ['V', 'vii°'];
    const isOnDominantDegree = dominantDegrees.includes(roman);

    if (chord.type === 'Mayor' && !chordHasInterval(chord, 11) && !isOnDominantDegree) {
        const newChord = parseChordString(`${chord.rootNote}maj7`);
        if (newChord) {
            suggestions.push({
                chord: newChord,
                technique: 'Coloración (Jazz/Soul)',
                justification: 'Añade una 7ma mayor para un sonido más rico.'
            });
        }
    }

    if (chord.type === 'Mayor' && roman === 'V' && !chordHasInterval(chord, 10)) {
        const newChord = parseChordString(`${chord.rootNote}7`);
        if (newChord) {
            suggestions.push({
                chord: newChord,
                technique: 'Coloración (Jazz/Soul)',
                justification: 'Añade la 7ª dominante para reforzar la resolución al I.'
            });
        }
    }

    if (chord.type === 'Menor' && !chordHasInterval(chord, 10)) {
        if (roman === 'vii°') {
            const newChord = parseChordString(`${chord.rootNote}m7b5`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Coloración (Jazz/Soul)',
                    justification: 'El vii° natural lleva 7ª semidisminuida (ø7), no menor.'
                });
            }
        } else {
            const newChord = parseChordString(`${chord.rootNote}m7`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Coloración (Jazz/Soul)',
                    justification: 'Añade una 7ma menor, un estándar del estilo.'
                });
            }
        }
    }

    return suggestions;
}

export function addExtensions(chord: ChordAnalysis, _key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    const suggestions: ChordSuggestion[] = [];
    if (settings.density === 'low') return suggestions;

    const { func } = chord.analysis || {};
    const isTonic = func === 'Tonic';
    const isDominant = func === 'Dominant';
    const isMinor = isMinorFamily(chord.type);
    const isMajor = isMajorFamily(chord.type);

    if (isMinor) {
        if (settings.style === 'gospel' && isTonic) {
            const c1 = parseChordString(`${chord.rootNote}m(maj7)`);
            if (c1) suggestions.push({ chord: c1, technique: 'Gospel Minor', justification: 'Tónica menor gospel dramática' });
            if (settings.density === 'high') {
                const c2 = parseChordString(`${chord.rootNote}m9(maj7)`);
                if (c2) suggestions.push({ chord: c2, technique: 'Gospel Minor', justification: 'Tónica menor gospel densa' });
            }
        } else if (settings.style === 'bolero') {
            const c1 = parseChordString(`${chord.rootNote}m9`);
            if (c1) suggestions.push({ chord: c1, technique: 'Bolero Minor', justification: 'Extensión suave' });
        } else {
            const targetExt = settings.density === 'high' ? 'm13' : (settings.density === 'medium' ? 'm11' : 'm9');
            const c1 = parseChordString(`${chord.rootNote}${targetExt}`);
            if (c1) suggestions.push({ chord: c1, technique: 'Extensión Diatónica', justification: `Escalonado por intensidad: ${targetExt}` });
        }
    } else if (isMajor && isTonic) {
        if (settings.style === 'bolero') {
            const c1 = parseChordString(`${chord.rootNote}6/9`);
            if (c1) suggestions.push({ chord: c1, technique: 'Bolero Tonic', justification: 'Tónica suave 6/9 en vez de maj7' });
            const c2 = parseChordString(`${chord.rootNote}maj9`);
            if (c2) suggestions.push({ chord: c2, technique: 'Bolero Tonic', justification: 'Extensión 9na suave' });
        } else if (settings.style === 'neo-soul') {
            const c1 = parseChordString(`${chord.rootNote}maj7#11`);
            if (c1) suggestions.push({ chord: c1, technique: 'Neo-Soul Tonic', justification: 'Color lidio característico' });
            const c2 = parseChordString(`${chord.rootNote}maj9`);
            if (c2) suggestions.push({ chord: c2, technique: 'Neo-Soul Tonic', justification: 'Extensión 9na' });
        } else {
            const c1 = parseChordString(`${chord.rootNote}maj9`);
            if (c1) suggestions.push({ chord: c1, technique: 'Extensión Major', justification: 'Tónica con 9na' });
        }
    } else if (isDominant) {
        let ext = '9';
        if (settings.style === 'jazz' || settings.style === 'neo-soul') {
            ext = settings.density === 'high' ? '7alt' : '13';
        } else if (settings.style === 'bolero') {
            ext = '7b9';
        } else {
            ext = '13';
        }
        const c1 = parseChordString(`${chord.rootNote}${ext}`);
        if (c1) suggestions.push({ chord: c1, technique: 'Dominante Extendido', justification: `Tensión ${ext} propia del estilo` });
    }

    return suggestions;
}

export function getStyleSpecificVocabulary(chord: ChordAnalysis, key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    const suggestions: ChordSuggestion[] = [];
    if (!chord.analysis) return [];
    const { roman, func } = chord.analysis;

    if (settings.style === 'gospel') {
        if (roman === 'I') {
            const ivRoot = transposeNote(key.key, 5);
            const c1 = parseChordString(`${ivRoot}/${key.key}`);
            if (c1) suggestions.push({ chord: c1, technique: 'Gospel Tonic', justification: 'IV sobre bajo de i' });
        }
        if (func === 'Dominant' || roman === 'IV') {
            const dimRoot = transposeNote(chord.rootNote, -1);
            const c1 = parseChordString(`${dimRoot}dim7`);
            if (c1) suggestions.push({ chord: c1, technique: 'Gospel Approach', justification: 'Disminuido en tiempo fuerte' });
        }
    } else if (settings.style === 'neo-soul') {
        if (func === 'Dominant') {
            const c1 = parseChordString(`${chord.rootNote}9sus4`);
            if (c1) suggestions.push({ chord: c1, technique: 'Neo-Soul Sus', justification: 'Suspensión 11na/9sus4 sin resolver clásica' });
        }
        if (roman === 'IV') {
            const c1 = parseChordString(`${chord.rootNote}maj7#5`);
            if (c1) suggestions.push({ chord: c1, technique: 'Neo-Soul Color', justification: 'maj7#5 moderno' });
        }
    } else if (settings.style === 'bolero') {
        if (func === 'Dominant') {
            const c1 = parseChordString(`${chord.rootNote}aug`);
            if (c1) suggestions.push({ chord: c1, technique: 'Bolero Dominant', justification: 'Acorde aumentado alternativo' });
        }
        if (roman === 'V') {
            const sharpFourRoot = transposeNote(key.key, 6);
            const c1 = parseChordString(`${sharpFourRoot}dim7`);
            if (c1) suggestions.push({ chord: c1, technique: 'Bolero Paso', justification: '#IVdim de paso hacia el V' });
        }
    }
    return suggestions;
}

export function getCoryHenryVocabulary(chord: ChordAnalysis, _key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (settings.style !== 'gospel') return [];
    const suggestions: ChordSuggestion[] = [];
    const func = chord.analysis?.func;
    const isTonic = func === 'Tonic';
    const isSubdominant = func === 'Subdominant';
    const isDominant = func === 'Dominant';

    if (isTonic || isSubdominant) {
        if (isMinorFamily(chord.type)) {
            const c = parseChordString(`${chord.rootNote}m9`);
            if (c) suggestions.push({ chord: c, technique: 'Cluster Cory Henry', justification: 'Voicing denso 9na+3ra+7ma — gospel de alta densidad.' });
        } else if (isMajorFamily(chord.type)) {
            const c = parseChordString(`${chord.rootNote}maj9`);
            if (c) suggestions.push({ chord: c, technique: 'Cluster Cory Henry', justification: 'Voicing denso 9na+3ra+7ma — gospel de alta densidad.' });
        }
    }

    if (isTonic && isMajorFamily(chord.type) && chord.analysis?.roman === 'I') {
        const ivRoot = transposeNote(chord.rootNote, 5);
        const c = parseChordString(`${ivRoot}/${chord.rootNote}`);
        if (c) suggestions.push({ chord: c, technique: 'Gospel IV/I', justification: 'IV sobre bajo de tónica — el acorde de reposo del gospel moderno.' });
    }

    if (isDominant) {
        const c = parseChordString(`${chord.rootNote}7#9`);
        if (c) suggestions.push({ chord: c, technique: 'Hendrix Chord', justification: 'Dom7#9 — tensión funk/gospel característica de Cory Henry.' });
    }

    if (settings.density === 'high' && isTonic && chord.analysis?.roman === 'I') {
        const upRoot = transposeNote(chord.rootNote, 1);
        const c = parseChordString(`${upRoot}maj7`);
        if (c) suggestions.push({ chord: c, technique: 'Modulación Cory Henry', justification: 'Sube un semitono en el clímax — firma de Cory Henry en adoración gospel.' });
    }

    return suggestions;
}

export function getSnarkyPuppyVocabulary(chord: ChordAnalysis, _key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
    if (settings.style !== 'neo-soul' && settings.style !== 'jazz') return [];
    const suggestions: ChordSuggestion[] = [];

    if (isDominantFamily(chord.type) || chord.analysis?.func === 'Dominant') {
        const c = parseChordString(`${chord.rootNote}7#11`);
        if (c) suggestions.push({ chord: c, technique: 'Lidio Dominante', justification: '7#11 — color Snarky Puppy/jazz fusión, dominante que no quiere resolver.' });
    }

    if (settings.density === 'high') {
        const upRoot = transposeNote(chord.rootNote, 1);
        const c = parseChordString(`${upRoot}/${chord.rootNote}`);
        if (c) suggestions.push({ chord: c, technique: 'Poliacorde', justification: 'Dos tríadas a semitono — ambigüedad tonal máxima, muy Snarky Puppy.' });
    }

    if (chord.analysis?.func === 'Tonic') {
        const c = parseChordString(`${chord.rootNote}sus2`);
        if (c) suggestions.push({ chord: c, technique: 'Sus2 Abierto', justification: 'Sus2 como acorde de llegada sin 3ra — color abierto y moderno.' });
    }

    if ((isMajorFamily(chord.type) || isMinorFamily(chord.type)) && settings.density === 'high') {
        const c = parseChordString(`${chord.rootNote}add9`);
        if (c) suggestions.push({ chord: c, technique: 'Omit3 Snarky', justification: 'Sin 3ra — ambigüedad mayor/menor, sonido muy Snarky Puppy/moderno.' });
    }

    return suggestions;
}
