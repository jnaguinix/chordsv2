/*
================================================================================
|                     src/utils/reharmonization-engine.ts                      |
|                El Cerebro Musical - Motor de Rearmonización                  |
|                   (Versión con Análisis Armónico Avanzado)                   |
================================================================================
*/

import type { SequenceItem, DetectedKey, ChordSuggestion, ReharmonizationSettings, ChordAnalysis, ProcessedSong } from '../types';
import { NOTE_TO_INDEX, INDEX_TO_SHARP_NAME, MUSICAL_INTERVALS } from './constants';
import { transposeNote, parseChordString, formatChordName, getChordNotes } from './chord-utils';

// --- El Analizador de Contexto ---

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
// Escala menor armónica: 7mo grado elevado → V mayor (dominante real)
const HARMONIC_MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 11];

const MAJOR_SCALE_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_SCALE_DEGREES = ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'];
// En menor armónica: V es mayor (dominante funcional) y vii° es disminuido
const HARMONIC_MINOR_DEGREES = ['i', 'ii°', 'bIII+', 'iv', 'V', 'bVI', 'vii°'];

// Helper: Determina si un tipo de acorde pertenece a la familia "menor"
// (Menor, m7, m9, m11, m(maj7), m6, m7b5, madd9, etc.)
const MINOR_FAMILY_IDS = new Set(['Menor', 'm7', 'm9', 'm11', 'm(maj7)', 'm6', 'm7b5', 'madd9']);
const isMinorFamily = (type: string): boolean => MINOR_FAMILY_IDS.has(type);

// Helper: Determina si un tipo de acorde es dominante (contiene 7ª menor + 3ra mayor)
const DOMINANT_FAMILY_IDS = new Set(['7', '9', '13', '11', '7b9', '7#9', '7sus4', '7sus2', '9sus4', '7#5', '7#11']);
const isDominantFamily = (type: string): boolean => DOMINANT_FAMILY_IDS.has(type);

// Helper: Determina si un tipo de acorde es de la familia "mayor" (3ra mayor, sin 7ª menor)
const MAJOR_FAMILY_IDS = new Set(['Mayor', 'maj7', 'maj9', '6', '6/9', 'maj7#11', 'add9']);
const isMajorFamily = (type: string): boolean => MAJOR_FAMILY_IDS.has(type);

// ========================================================================
// REFINAMIENTO PRINCIPAL: La función `analyzeChordContext` ahora es mucho más inteligente.
// ========================================================================
function analyzeChordContext(chord: SequenceItem, detectedKey: DetectedKey): ChordAnalysis | null {
    if (!chord || !chord.rootNote) return null;
    const rootIndex = NOTE_TO_INDEX[chord.rootNote];
    if (rootIndex === undefined) return null;

    const keyRootIndex = NOTE_TO_INDEX[detectedKey.key];
    const interval = (rootIndex - keyRootIndex + 12) % 12;

    let degreeInfo: { degree: string, roman: string } | null = null;
    const isMajorKey = detectedKey.scale === 'Major';

    // Extrae el grado base del numeral romano (ej. 'bVII7' → 'bVII', 'V7/ii' → 'V')
    const getBaseRoman = (roman: string): string => {
        return roman.replace(/(maj7|7|\+|°).*$/, '').split('/')[0];
    };

    const getFunction = (roman: string): 'Tonic' | 'Subdominant' | 'Dominant' | 'Transition' => {
        const base = getBaseRoman(roman);
        // v (menor natural) se clasifica como Tónica — no tiene tritono, no es dominante funcional
        if (['I', 'vi', 'i', 'bIII', 'bVI', 'v'].includes(base)) return 'Tonic';
        if (['IV', 'ii', 'iv', 'ii°'].includes(base)) return 'Subdominant';
        if (['V', 'vii°', 'bVII'].includes(base)) return 'Dominant';
        return 'Transition';
    };

    // Paso 1: Búsqueda de Grado Diatónico (el caso más común)
    const scaleIntervals = isMajorKey ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
    const scaleDegrees = isMajorKey ? MAJOR_SCALE_DEGREES : MINOR_SCALE_DEGREES;
    const degreeIndex = scaleIntervals.indexOf(interval);

    if (degreeIndex !== -1) {
        degreeInfo = { degree: (degreeIndex + 1).toString(), roman: scaleDegrees[degreeIndex] };
    } else {
        // Si no es diatónico, empieza la búsqueda avanzada.

        // Paso 1.5: En menor, verificar si es un V mayor (escala armónica)
        if (!isMajorKey) {
            const harmonicDegreeIndex = HARMONIC_MINOR_SCALE_INTERVALS.indexOf(interval);
            if (harmonicDegreeIndex !== -1 && HARMONIC_MINOR_DEGREES[harmonicDegreeIndex] !== MINOR_SCALE_DEGREES[harmonicDegreeIndex]) {
                degreeInfo = { degree: (harmonicDegreeIndex + 1).toString(), roman: HARMONIC_MINOR_DEGREES[harmonicDegreeIndex] };
            }
        }

        // Paso 2: Búsqueda de Acordes de Intercambio Modal (si estamos en tonalidad Mayor)
        if (!degreeInfo && isMajorKey) {
            const modalInterchangeMap: { [interval: number]: { roman: string, check?: 'minor' | 'dominant' | 'major' } } = {
                3: { roman: 'bIII', check: 'major' },     // ej. Eb, Ebmaj7 en C Mayor (debe ser mayor)
                5: { roman: 'iv', check: 'minor' },       // ej. Fm, Fm7, Fm9 en C Mayor
                8: { roman: 'bVI', check: 'major' },       // ej. Ab, Abmaj7 en C Mayor (debe ser mayor)
                10: { roman: 'bVII', check: 'dominant' }   // ej. Bb, Bb7 en C Mayor (mayor o dominante)
            };
            const foundInterchange = modalInterchangeMap[interval];
            if (foundInterchange) {
                let matches = true;
                if (foundInterchange.check === 'minor') matches = isMinorFamily(chord.type);
                if (foundInterchange.check === 'dominant') matches = isDominantFamily(chord.type) || isMajorFamily(chord.type);
                if (foundInterchange.check === 'major') matches = isMajorFamily(chord.type);
                if (matches) {
                    degreeInfo = { degree: foundInterchange.roman, roman: foundInterchange.roman };
                }
            }
        }

        // Paso 3: Búsqueda de Dominantes Secundarios (si aún no se ha encontrado)
        if (!degreeInfo && isDominantFamily(chord.type)) {
            for (let i = 0; i < scaleIntervals.length; i++) {
                const diatonicRoot = (keyRootIndex + scaleIntervals[i]) % 12;
                const dominantOfDiatonic = (diatonicRoot + 7) % 12;
                if (rootIndex === dominantOfDiatonic) {
                    degreeInfo = { degree: `V7/${scaleDegrees[i]}`, roman: `V7/${scaleDegrees[i]}` };
                    break;
                }
            }
        }
    }

    if (degreeInfo) {
        return {
            ...chord,
            analysis: {
                degree: degreeInfo.degree,
                roman: degreeInfo.roman,
                func: getFunction(degreeInfo.roman),
            }
        };
    }
    
    // Si después de todas las búsquedas no se encuentra, se marca como no analizado.
    return { ...chord, analysis: null };
}

class IntelliHarmonixEngine {
    
    private chordHasInterval(chord: SequenceItem, intervalInSemitones: number): boolean {
        const intervals = MUSICAL_INTERVALS[chord.type];
        if (!intervals) return false;
        return intervals.includes(intervalInSemitones);
    }

    private getDiatonicSubstitutions(chord: ChordAnalysis, key: DetectedKey): ChordSuggestion[] {
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
            if (newChord && formatChordName(newChord, {style: 'short'}) !== formatChordName(chord, {style: 'short'})) {
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

    private getSecondaryDominants(nextChord: ChordAnalysis): ChordSuggestion[] {
        if (!nextChord.analysis || ['I', 'i', 'vii°'].includes(nextChord.analysis.roman)) return [];
        
        const targetRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
        if (targetRootIndex === undefined) return [];

        const dominantRoot = transposeNote(INDEX_TO_SHARP_NAME[targetRootIndex], 7);
        const dominantChord = parseChordString(`${dominantRoot}7`);

        if (dominantChord) {
            return [{
                chord: dominantChord,
                technique: 'Dominante Secundario',
                justification: `Prepara el acorde ${formatChordName(nextChord, { style: 'short' })}`
            }];
        }
        return [];
    }

    private getTritoneSubstitution(chord: ChordAnalysis): ChordSuggestion[] {
        if (!this.chordHasInterval(chord, 10)) return [];
        if (!this.chordHasInterval(chord, 4)) return [];
        if (!chord.analysis || chord.analysis.func !== 'Dominant') return [];

        const tritoneRoot = transposeNote(chord.rootNote, 6);
        const tritoneChord = parseChordString(`${tritoneRoot}7`);

        if (tritoneChord) {
            return [{
                chord: tritoneChord,
                technique: 'Sustitución de Tritono',
                justification: `Crea una línea de bajo cromática.`
            }];
        }
        return [];
    }
    
    private getModalInterchange(chord: ChordAnalysis, key: DetectedKey): ChordSuggestion[] {
        if (!chord.analysis || key.scale !== 'Major') return [];
        const suggestions: ChordSuggestion[] = [];
        const { roman } = chord.analysis;
        const keyRoot = key.key;

        if (roman === 'IV') {
            const minorSubdominantRoot = transposeNote(keyRoot, 5);
            const newChord = parseChordString(`${minorSubdominantRoot}m7`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Intercambio Modal',
                    justification: 'Acorde "prestado" de la tonalidad menor (ivm7).'
                });
            }
        }

        if (roman === 'V') {
            const backdoorRoot = transposeNote(keyRoot, 10);
            const newChord = parseChordString(`${backdoorRoot}7`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Intercambio Modal',
                    justification: 'Dominante "Backdoor" (bVII7), resolución suave al I.'
                });
            }
            const flatSixRoot = transposeNote(keyRoot, 8);
            const flatSixChord = parseChordString(`${flatSixRoot}maj7`);
            if (flatSixChord) {
                suggestions.push({
                    chord: flatSixChord,
                    technique: 'Intercambio Modal',
                    justification: 'Resolución deceptiva (bVImaj7), sonido sofisticado.'
                });
            }
        }
        return suggestions;
    }


    private getStyledVoicings(chord: ChordAnalysis): ChordSuggestion[] {
        if (!chord.analysis) return [];
        const suggestions: ChordSuggestion[] = [];
        const { roman } = chord.analysis;

        // No sugerir maj7 en el grado V — destruye la función dominante.
        // Solo I, IV (y sustitutos iii, vi, bIII, bVI) reciben maj7.
        const dominantDegrees = ['V', 'vii°'];
        const isOnDominantDegree = dominantDegrees.includes(roman);

        if (chord.type === 'Mayor' && !this.chordHasInterval(chord, 11) && !isOnDominantDegree) {
            const newChord = parseChordString(`${chord.rootNote}maj7`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Coloración (Jazz/Soul)',
                    justification: 'Añade una 7ma mayor para un sonido más rico.'
                });
            }
        }

        // En el grado V, sugerir 7 dominante en vez de maj7
        if (chord.type === 'Mayor' && roman === 'V' && !this.chordHasInterval(chord, 10)) {
            const newChord = parseChordString(`${chord.rootNote}7`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Coloración (Jazz/Soul)',
                    justification: 'Añade la 7ª dominante para reforzar la resolución al I.'
                });
            }
        }

        if (chord.type === 'Menor' && !this.chordHasInterval(chord, 10)) {
            // En vii°, sugerir m7b5 (semidisminuido) en vez de m7
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

    private addExtensions(chord: ChordAnalysis, key: DetectedKey): ChordSuggestion[] {
        const suggestions: ChordSuggestion[] = [];
        const { notesToPress } = getChordNotes(chord);
        if (notesToPress.length === 0) return [];

        const rootMidi = NOTE_TO_INDEX[chord.rootNote];
        if (rootMidi === undefined) return [];
        
        const intervals = new Set(notesToPress.map(note => (note - rootMidi + 12) % 12));

        if (intervals.has(11) && intervals.has(4) && !intervals.has(3)) {
            const newChord = parseChordString(`${chord.rootNote}maj9`);
            if (newChord) {
                suggestions.push({
                    chord: newChord,
                    technique: 'Extensión de Acorde',
                    justification: 'Añade la 9na para un sonido más sofisticado (maj9).'
                });
            }
        }

        if (intervals.has(10)) {
            // Acorde con 7ª menor
            if (intervals.has(3) || intervals.has(4)) {
                // Es menor (tiene b3)
                if (intervals.has(3)) {
                    if (chord.analysis?.roman === 'iii' && key.scale === 'Major') {
                        const newChord = parseChordString(`${chord.rootNote}m9`);
                        if (newChord) {
                            suggestions.push({
                                chord: newChord,
                                technique: 'Extensión de Acorde',
                                justification: 'Añade la 9na mayor (diatónica) apropiada para el iii grado.'
                            });
                        }
                    } else {
                        const newChord = parseChordString(`${chord.rootNote}m9`);
                        if (newChord) {
                            suggestions.push({
                                chord: newChord,
                                technique: 'Extensión de Acorde',
                                justification: 'Añade la 9na para un color Neo-Soul/Jazz (m9).'
                            });
                        }
                    }
                }
                // Es dominante (tiene 3 mayor + b7) → sugerir 9 dominante
                if (intervals.has(4) && !intervals.has(3)) {
                    const newChord = parseChordString(`${chord.rootNote}9`);
                    if (newChord) {
                        suggestions.push({
                            chord: newChord,
                            technique: 'Extensión de Acorde',
                            justification: 'Añade la 9na para un color más abierto (dom9).'
                        });
                    }
                }
            }
        }
        return suggestions;
    }


    private scoreByVoiceLeading(suggestions: ChordSuggestion[], referenceChord: SequenceItem): ChordSuggestion[] {
        const refNotes = getChordNotes(referenceChord);
        const refPitchClasses = new Set(refNotes.notesToPress.map(n => n % 12));
        const refRootIndex = NOTE_TO_INDEX[referenceChord.rootNote] ?? 0;

        return [...suggestions].sort((a, b) => {
            const scoreChord = (s: ChordSuggestion): number => {
                const sNotes = getChordNotes(s.chord);
                const sPitchClasses = new Set(sNotes.notesToPress.map(n => n % 12));
                const commonTones = [...sPitchClasses].filter(n => refPitchClasses.has(n)).length;
                const sRootIndex = NOTE_TO_INDEX[s.chord.rootNote] ?? 0;
                const rootDist = Math.min(
                    (sRootIndex - refRootIndex + 12) % 12,
                    (refRootIndex - sRootIndex + 12) % 12
                );
                return (commonTones * 2) - (rootDist / 12);
            };
            return scoreChord(b) - scoreChord(a);
        });
    }

    public getSuggestionsForChord(chordItem: SequenceItem, key: DetectedKey, prevChordItem?: SequenceItem): ChordSuggestion[] {
        const analyzedChord = analyzeChordContext(chordItem, key);
        if (!analyzedChord) return [];

        let allSuggestions: ChordSuggestion[] = [];

        allSuggestions.push(...this.getDiatonicSubstitutions(analyzedChord, key));
        allSuggestions.push(...this.getTritoneSubstitution(analyzedChord));
        allSuggestions.push(...this.getStyledVoicings(analyzedChord));
        allSuggestions.push(...this.addExtensions(analyzedChord, key));
        allSuggestions.push(...this.getModalInterchange(analyzedChord, key));

        const uniqueSuggestions = allSuggestions.filter((suggestion, index, self) =>
            index === self.findIndex((s) => (
                formatChordName(s.chord, { style: 'short' }) === formatChordName(suggestion.chord, { style: 'short' })
            ))
        );

        return prevChordItem
            ? this.scoreByVoiceLeading(uniqueSuggestions, prevChordItem)
            : uniqueSuggestions;
    }

    private getBassLineMelodicPassing(prevChord: ChordAnalysis, nextChord: ChordAnalysis, key: DetectedKey): ChordSuggestion[] {
        const suggestions: ChordSuggestion[] = [];
        const prevRootIndex = NOTE_TO_INDEX[prevChord.rootNote];
        const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
        if (prevRootIndex === undefined || nextRootIndex === undefined) return [];

        const scaleIntervals = key.scale === 'Major' ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
        const keyRootIndex = NOTE_TO_INDEX[key.key];

        const ascDist = (nextRootIndex - prevRootIndex + 12) % 12;
        const descDist = (prevRootIndex - nextRootIndex + 12) % 12;

        // Movimiento ascendente de 4ª (5 semitonos): C→F — insertar inversión I/3 (C/E)
        if (ascDist === 5 && isMajorFamily(prevChord.type)) {
            const thirdOfPrev = transposeNote(prevChord.rootNote, 4);
            const passingChord = parseChordString(`${prevChord.rootNote}/${thirdOfPrev}`);
            if (passingChord) {
                suggestions.push({
                    chord: passingChord,
                    technique: 'Bajo Melódico Escalar',
                    justification: `Línea de bajo ascendente: ${prevChord.rootNote}–${thirdOfPrev}–${nextChord.rootNote}.`
                });
            }
        }

        // Movimiento descendente de 4ª (5 desc = 7 asc): F→C — bajo escalar F-E-D-C con acordes diatónicos
        if (descDist === 5) {
            // Inserta el acorde diatónico cuya raíz está un tono abajo del acorde previo
            const stepDown = transposeNote(prevChord.rootNote, -2);
            const stepDownIndex = NOTE_TO_INDEX[stepDown];
            if (stepDownIndex !== undefined) {
                const intervalFromKey = (stepDownIndex - keyRootIndex + 12) % 12;
                const degreeIndex = scaleIntervals.indexOf(intervalFromKey);
                if (degreeIndex !== -1) {
                    const isDiatMinor = [1, 2, 5].includes(degreeIndex); // ii, iii, vi en mayor
                    const passingType = isDiatMinor ? 'm7' : '7';
                    const passingChord = parseChordString(`${stepDown}${passingType}`);
                    if (passingChord) {
                        suggestions.push({
                            chord: passingChord,
                            technique: 'Bajo Melódico Escalar',
                            justification: `Línea de bajo descendente hacia ${nextChord.rootNote}.`
                        });
                    }
                }
            }
        }

        // Movimiento de 3ª menor ascendente (3 semitonos): ej. C→Eb — bajo C-D-Eb
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
                        suggestions.push({
                            chord: passingChord,
                            technique: 'Bajo Melódico Escalar',
                            justification: `Rellena la 3ª menor con un acorde diatónico de paso.`
                        });
                    }
                }
            }
        }

        // Movimiento de 3ª mayor ascendente (4 semitonos): ej. C→E — bajo C-D-E
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
                        suggestions.push({
                            chord: passingChord,
                            technique: 'Bajo Melódico Escalar',
                            justification: `Rellena la 3ª mayor con un acorde diatónico de paso.`
                        });
                    }
                }
            }
        }

        return suggestions;
    }

    private getBackdoorPassing(prevChord: ChordAnalysis, nextChord: ChordAnalysis, key: DetectedKey): ChordSuggestion[] {
        if (!nextChord.analysis) return [];
        const suggestions: ChordSuggestion[] = [];
        const keyRootIndex = NOTE_TO_INDEX[key.key];
        if (keyRootIndex === undefined) return [];

        // Backdoor ii-V → I: cuando el destino es el I (mayor), ofrecer ivm7 → bVII7 como camino alternativo
        const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
        const isDestinationTonic =
            (nextChord.analysis.roman === 'I' || nextChord.analysis.roman === 'i') &&
            isMajorFamily(nextChord.type);

        if (isDestinationTonic && nextRootIndex !== undefined) {
            // ivm7: 4ª menor sobre la tónica destino
            const minorFourthRoot = transposeNote(key.key, 5);
            const backdoorTwo = parseChordString(`${minorFourthRoot}m7`);
            if (backdoorTwo) {
                suggestions.push({
                    chord: backdoorTwo,
                    technique: 'Backdoor ii-V',
                    justification: `ivm7 inicia el camino backdoor (iv–bVII7) hacia ${formatChordName(nextChord, { style: 'short' })}.`
                });
            }

            // bVII7: dominante a dos semitonos bajo la tónica
            const backdoorDominantRoot = transposeNote(key.key, 10);
            const backdoorDominant = parseChordString(`${backdoorDominantRoot}7`);
            if (backdoorDominant) {
                suggestions.push({
                    chord: backdoorDominant,
                    technique: 'Backdoor ii-V',
                    justification: `bVII7 resuelve hacia ${formatChordName(nextChord, { style: 'short' })} con movimiento de semitono descendente en el bajo.`
                });
            }
        }

        return suggestions;
    }

    public getPassingChordSuggestions(prevChordItem: SequenceItem, nextChordItem: SequenceItem, key: DetectedKey): ChordSuggestion[] {
        const prevChord = analyzeChordContext(prevChordItem, key);
        const nextChord = analyzeChordContext(nextChordItem, key);

        if (!prevChord || !nextChord || !nextChord.analysis) return [];
        let suggestions: ChordSuggestion[] = [];
        const prevRootIndex = NOTE_TO_INDEX[prevChord.rootNote];
        const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];

        suggestions.push(...this.getSecondaryDominants(nextChord));

        if (prevRootIndex !== undefined && nextRootIndex !== undefined) {
            // Ascendente: ej. C → D, acorde de paso = C#dim7
            if ((prevRootIndex + 2) % 12 === nextRootIndex) {
                const passingRoot = transposeNote(prevChord.rootNote, 1);
                const passingChord = parseChordString(`${passingRoot}dim7`);
                if (passingChord) {
                    suggestions.push({
                        chord: passingChord,
                        technique: 'Acorde de Paso Disminuido',
                        justification: 'Conexión cromática ascendente suave.'
                    });
                }
            }
            // Descendente: ej. D → C, acorde de paso = C#dim7 (= Db dim7)
            if ((nextRootIndex + 2) % 12 === prevRootIndex) {
                const passingRoot = transposeNote(nextChord.rootNote, 1);
                const passingChord = parseChordString(`${passingRoot}dim7`);
                if (passingChord) {
                    suggestions.push({
                        chord: passingChord,
                        technique: 'Acorde de Paso Disminuido',
                        justification: 'Conexión cromática descendente suave.'
                    });
                }
            }
        }
        
        if (prevChord.analysis?.roman === 'I' && nextChord.analysis.roman === 'vi') {
            const thirdOfPrev = transposeNote(prevChord.rootNote, 4);
            const passingChord = parseChordString(`${prevChord.rootNote}/${thirdOfPrev}`);
            if (passingChord) {
                suggestions.push({
                    chord: passingChord,
                    technique: 'Bajo de Paso por Inversión',
                    justification: `Usa I en 1ra inversión (${formatChordName(passingChord, {style: 'short'})}) para un bajo melódico.`
                });
            }
             const dominantOfPrev = transposeNote(prevChord.rootNote, 7);
             const thirdOfDominant = transposeNote(dominantOfPrev, 4);
             const passingChordV7 = parseChordString(`${dominantOfPrev}7/${thirdOfDominant}`);
             if (passingChordV7) {
                 suggestions.push({
                     chord: passingChordV7,
                     technique: 'Bajo de Paso Cromático',
                     justification: `Usa el V7 en 1ra inversión (${formatChordName(passingChordV7, {style: 'short'})}) para conectar.`
                 });
             }
        }
        
        if (!['I', 'i', 'vii°'].includes(nextChord.analysis.roman)) {
            const targetRoot = nextChord.rootNote;
            const relatedTwoRoot = transposeNote(targetRoot, 2);
            const targetIsMajorOrDominant = isMajorFamily(nextChord.type) || isDominantFamily(nextChord.type);
            const relatedTwoType = targetIsMajorOrDominant ? 'm7' : 'm7b5';
            const relatedTwoChord = parseChordString(`${relatedTwoRoot}${relatedTwoType}`);
            if (relatedTwoChord) {
                 suggestions.push({
                    chord: relatedTwoChord,
                    technique: 'II-V Relacionado (el II)',
                    justification: `Inicia el II-V que resuelve a ${formatChordName(nextChord, { style: 'short' })}.`
                });
            }
        }

        suggestions.push(...this.getBassLineMelodicPassing(prevChord, nextChord, key));
        suggestions.push(...this.getBackdoorPassing(prevChord, nextChord, key));

        return suggestions.filter((suggestion, index, self) =>
            index === self.findIndex((s) => (
                formatChordName(s.chord, { style: 'short' }) === formatChordName(suggestion.chord, { style: 'short' })
            ))
        );
    }

    public applyGlobalReharmonization(progression: SequenceItem[], key: DetectedKey, settings: ReharmonizationSettings): ProcessedSong {
        console.log(`Aplicando rearmonización global en la tonalidad de ${key.key} ${key.scale} con los ajustes:`, settings);
        
        const reharmonizedChords = progression.map(chord => {
            return { chord: chord, position: 0 };
        });

        return { lines: [{ lyrics: '', chords: reharmonizedChords }], allChords: progression };
    }
}

export const IntelliHarmonix = new IntelliHarmonixEngine();
