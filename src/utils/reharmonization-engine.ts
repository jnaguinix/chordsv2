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
const HARMONIC_MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 11];

const MAJOR_SCALE_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_SCALE_DEGREES = ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'];
const HARMONIC_MINOR_DEGREES = ['i', 'ii°', 'bIII+', 'iv', 'V', 'bVI', 'vii°'];

const MINOR_FAMILY_IDS = new Set(['Menor', 'm7', 'm9', 'm11', 'm(maj7)', 'm6', 'm7b5', 'madd9']);
const isMinorFamily = (type: string): boolean => MINOR_FAMILY_IDS.has(type);

const DOMINANT_FAMILY_IDS = new Set(['7', '9', '13', '11', '7b9', '7#9', '7sus4', '7sus2', '9sus4', '7#5', '7#11', '7alt']);
const isDominantFamily = (type: string): boolean => DOMINANT_FAMILY_IDS.has(type);

const MAJOR_FAMILY_IDS = new Set(['Mayor', 'maj7', 'maj9', '6', '6/9', 'maj7#11', 'add9']);
const isMajorFamily = (type: string): boolean => MAJOR_FAMILY_IDS.has(type);

function analyzeChordContext(chord: SequenceItem, detectedKey: DetectedKey): ChordAnalysis | null {
    if (!chord || !chord.rootNote) return null;
    const rootIndex = NOTE_TO_INDEX[chord.rootNote];
    if (rootIndex === undefined) return null;

    const keyRootIndex = NOTE_TO_INDEX[detectedKey.key];
    const interval = (rootIndex - keyRootIndex + 12) % 12;

    let degreeInfo: { degree: string, roman: string } | null = null;
    const isMajorKey = detectedKey.scale === 'Major';

    const getBaseRoman = (roman: string): string => {
        return roman.replace(/(maj7|7|\+|°).*$/, '').split('/')[0];
    };

    const getFunction = (roman: string): 'Tonic' | 'Subdominant' | 'Dominant' | 'Transition' => {
        const base = getBaseRoman(roman);
        if (['I', 'vi', 'i', 'bIII', 'bVI', 'v'].includes(base)) return 'Tonic';
        if (['IV', 'ii', 'iv', 'ii°'].includes(base)) return 'Subdominant';
        if (['V', 'vii°', 'bVII'].includes(base)) return 'Dominant';
        return 'Transition';
    };

    const scaleIntervals = isMajorKey ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
    const scaleDegrees = isMajorKey ? MAJOR_SCALE_DEGREES : MINOR_SCALE_DEGREES;
    const degreeIndex = scaleIntervals.indexOf(interval);

    if (degreeIndex !== -1) {
        degreeInfo = { degree: (degreeIndex + 1).toString(), roman: scaleDegrees[degreeIndex] };
    } else {
        if (!isMajorKey) {
            const harmonicDegreeIndex = HARMONIC_MINOR_SCALE_INTERVALS.indexOf(interval);
            if (harmonicDegreeIndex !== -1 && HARMONIC_MINOR_DEGREES[harmonicDegreeIndex] !== MINOR_SCALE_DEGREES[harmonicDegreeIndex]) {
                degreeInfo = { degree: (harmonicDegreeIndex + 1).toString(), roman: HARMONIC_MINOR_DEGREES[harmonicDegreeIndex] };
            }
        }

        if (!degreeInfo && isMajorKey) {
            const modalInterchangeMap: { [interval: number]: { roman: string, check?: 'minor' | 'dominant' | 'major' } } = {
                3: { roman: 'bIII', check: 'major' },
                5: { roman: 'iv', check: 'minor' },
                8: { roman: 'bVI', check: 'major' },
                10: { roman: 'bVII', check: 'dominant' }
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
    
    return { ...chord, analysis: null };
}

class IntelliHarmonixEngine {
    
    private chordHasInterval(chord: SequenceItem, intervalInSemitones: number): boolean {
        const intervals = MUSICAL_INTERVALS[chord.type];
        if (!intervals) return false;
        return intervals.includes(intervalInSemitones);
    }

    private getDiatonicSubstitutions(chord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
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

    private getSecondaryDominants(nextChord: ChordAnalysis, settings: ReharmonizationSettings): ChordSuggestion[] {
        if (!nextChord.analysis || ['I', 'i', 'vii°'].includes(nextChord.analysis.roman)) return [];
        
        const targetRootIndex = NOTE_TO_INDEX[nextChord.rootNote];
        if (targetRootIndex === undefined) return [];

        const dominantRoot = transposeNote(INDEX_TO_SHARP_NAME[targetRootIndex], 7);
        
        // Gap 1: Dominantes secundarios planos
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
            // Gospel
            dominantType = isTargetMinor ? '7b9#5' : '9';
        }

        const dominantChord = parseChordString(`${dominantRoot}${dominantType}`);

        if (dominantChord) {
            return [{
                chord: dominantChord,
                technique: 'Dominante Secundario',
                justification: `Prepara el acorde destino (${dominantType} para estilo ${settings.style}).`
            }];
        }
        return [];
    }

    private getTritoneSubstitution(chord: ChordAnalysis, settings: ReharmonizationSettings): ChordSuggestion[] {
        if (!this.chordHasInterval(chord, 10)) return [];
        if (!this.chordHasInterval(chord, 4)) return [];
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
    
    private getModalInterchange(chord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
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


    private getStyledVoicings(chord: ChordAnalysis, _settings: ReharmonizationSettings): ChordSuggestion[] {
        if (!chord.analysis) return [];
        const suggestions: ChordSuggestion[] = [];
        const { roman } = chord.analysis;

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

    private addExtensions(chord: ChordAnalysis, _key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
        const suggestions: ChordSuggestion[] = [];
        if (settings.density === 'low') return suggestions;

        const { func } = chord.analysis || {};
        const isTonic = func === 'Tonic';
        const isDominant = func === 'Dominant';
        const isMinor = isMinorFamily(chord.type);
        const isMajor = isMajorFamily(chord.type);
        
        // Gap 2: Extensiones sin contexto funcional - solucionado con estilo y densidad
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

    private getCommonToneSubstitutions(chord: ChordAnalysis, key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
        const suggestions: ChordSuggestion[] = [];
        if (settings.density === 'low') return [];

        const refNotes = getChordNotes(chord);
        if (refNotes.notesToPress.length === 0) return [];
        const refPitchClasses = new Set(refNotes.notesToPress.map(n => n % 12));

        // Gap 3: Sustitución por nota común
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
                const testNotes = getChordNotes(testChord);
                const testPitchClasses = new Set(testNotes.notesToPress.map(n => n % 12));
                const intersection = [...testPitchClasses].filter(n => refPitchClasses.has(n));
                if (intersection.length >= 3 && matches < 3) {
                    const notesShared = intersection.map(n => INDEX_TO_SHARP_NAME[n]).join(', ');
                    suggestions.push({
                        chord: testChord,
                        technique: 'Intercambiable por Nota Común',
                        justification: `Comparte ${intersection.length} notas (${notesShared}).`
                    });
                    matches++;
                }
            }
        }
        return suggestions;
    }

    private getStyleSpecificVocabulary(chord: ChordAnalysis, key: DetectedKey, settings: ReharmonizationSettings): ChordSuggestion[] {
        const suggestions: ChordSuggestion[] = [];
        if (!chord.analysis) return [];
        const { roman, func } = chord.analysis;

        // Gap 4: Vocabulario de estilos diferenciado
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

    private scoreByVoiceLeading(suggestions: ChordSuggestion[], referenceChord: SequenceItem, settings: ReharmonizationSettings): ChordSuggestion[] {
        const refNotes = getChordNotes(referenceChord);
        const refPitchClasses = new Set(refNotes.notesToPress.map(n => n % 12));
        const refRootIndex = NOTE_TO_INDEX[referenceChord.rootNote] ?? 0;

        // Gap 6: Voice leading evaluando 3 voces simuladas
        return [...suggestions].sort((a, b) => {
            const scoreChord = (s: ChordSuggestion): number => {
                const sNotes = getChordNotes(s.chord);
                const sPitchClasses = new Set(sNotes.notesToPress.map(n => n % 12));
                const commonTones = [...sPitchClasses].filter(n => refPitchClasses.has(n)).length;
                const sRootIndex = NOTE_TO_INDEX[s.chord.rootNote] ?? 0;
                
                let rootDist = Math.min(
                    (sRootIndex - refRootIndex + 12) % 12,
                    (refRootIndex - sRootIndex + 12) % 12
                );

                let score = commonTones * 2;
                
                // Premiar semitono/tono (movimiento suave en bajo)
                if (rootDist === 1 || rootDist === 2) score += 2;
                // Penalizar saltos de 4ta o más
                if (rootDist >= 5) score -= 1;

                if (settings.style === 'bolero') {
                    // Priorizar bajo cromático descendente
                    const descDist = (refRootIndex - sRootIndex + 12) % 12;
                    if (descDist === 1 || descDist === 2) score += 3;
                }
                
                if (settings.style === 'gospel') {
                    // Permitir saltos dramáticos
                    if (rootDist === 5 || rootDist === 7) score += 1;
                }

                return score;
            };
            return scoreChord(b) - scoreChord(a);
        });
    }

    public getSuggestionsForChord(chordItem: SequenceItem, key: DetectedKey, prevChordItem?: SequenceItem, settings: ReharmonizationSettings = { style: 'jazz', density: 'medium' }): ChordSuggestion[] {
        const analyzedChord = analyzeChordContext(chordItem, key);
        if (!analyzedChord) return [];

        let allSuggestions: ChordSuggestion[] = [];

        allSuggestions.push(...this.getDiatonicSubstitutions(analyzedChord, key, settings));
        allSuggestions.push(...this.getTritoneSubstitution(analyzedChord, settings));
        allSuggestions.push(...this.getStyledVoicings(analyzedChord, settings));
        allSuggestions.push(...this.addExtensions(analyzedChord, key, settings));
        allSuggestions.push(...this.getModalInterchange(analyzedChord, key, settings));
        allSuggestions.push(...this.getCommonToneSubstitutions(analyzedChord, key, settings));
        allSuggestions.push(...this.getStyleSpecificVocabulary(analyzedChord, key, settings));

        const uniqueSuggestions = allSuggestions.filter((suggestion, index, self) =>
            index === self.findIndex((s) => (
                formatChordName(s.chord, { style: 'short' }) === formatChordName(suggestion.chord, { style: 'short' })
            ))
        );

        return prevChordItem
            ? this.scoreByVoiceLeading(uniqueSuggestions, prevChordItem, settings)
            : uniqueSuggestions;
    }

    private getBassLineMelodicPassing(prevChord: ChordAnalysis, nextChord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
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

    private getBackdoorPassing(_prevChord: ChordAnalysis, nextChord: ChordAnalysis, key: DetectedKey, _settings: ReharmonizationSettings): ChordSuggestion[] {
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

    public getPassingChordSuggestions(prevChordItem: SequenceItem, nextChordItem: SequenceItem, key: DetectedKey, settings: ReharmonizationSettings = { style: 'jazz', density: 'medium' }): ChordSuggestion[] {
        const prevChord = analyzeChordContext(prevChordItem, key);
        const nextChord = analyzeChordContext(nextChordItem, key);

        if (!prevChord || !nextChord || !nextChord.analysis) return [];
        let suggestions: ChordSuggestion[] = [];
        const prevRootIndex = NOTE_TO_INDEX[prevChord.rootNote];
        const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];

        suggestions.push(...this.getSecondaryDominants(nextChord, settings));

        if (prevRootIndex !== undefined && nextRootIndex !== undefined) {
            // Gap 5: Passing chords (Aproximación doble, pedal, tritono)
            const ascDist = (nextRootIndex - prevRootIndex + 12) % 12;
            const descDist = (prevRootIndex - nextRootIndex + 12) % 12;

            // Chromatic approach (dim7) directionally aware
            if (ascDist === 2 || ascDist === 1) {
                const passingRoot = transposeNote(prevChord.rootNote, 1);
                const passingChord = parseChordString(`${passingRoot}dim7`);
                if (passingChord) suggestions.push({ chord: passingChord, technique: 'Acorde de Paso Disminuido', justification: 'Ascendente cromático.' });
            }
            if (descDist === 2 || descDist === 1) {
                const passingRoot = transposeNote(nextChord.rootNote, 1);
                const passingChord = parseChordString(`${passingRoot}dim7`);
                if (passingChord) suggestions.push({ chord: passingChord, technique: 'Acorde de Paso Disminuido', justification: 'Descendente cromático.' });
            }

            // Aproximación doble cromática (jazz/neo-soul) - Gap 5
            if ((settings.style === 'jazz' || settings.style === 'neo-soul') && settings.density === 'high') {
                const approachUp = parseChordString(`${transposeNote(nextChord.rootNote, -1)}7alt`);
                if (approachUp) suggestions.push({ chord: approachUp, technique: 'Aproximación Cromática', justification: 'Aproximación desde abajo' });
            }

            // Acordes Pedal - Gap 5
            if (settings.density !== 'low' && prevRootIndex !== nextRootIndex) {
                const pedal = parseChordString(`${prevChord.rootNote}/${nextChord.rootNote}`);
                if (pedal) suggestions.push({ chord: pedal, technique: 'Acorde Pedal', justification: 'Mantiene raíz anterior sobre bajo nuevo' });
            }

            // Aumentados de paso (Bolero) - Gap 5
            if (settings.style === 'bolero' && (ascDist === 2 || descDist === 2)) {
                const aug = parseChordString(`${prevChord.rootNote}aug`);
                if (aug) suggestions.push({ chord: aug, technique: 'Aumentado de Paso', justification: 'Paso suave bolero' });
            }

            // Sus4 resolviendo (Neo-soul) - Gap 5
            if (settings.style === 'neo-soul' && nextChord.analysis.func === 'Dominant') {
                const sus = parseChordString(`${nextChord.rootNote}9sus4`);
                if (sus) suggestions.push({ chord: sus, technique: 'Sus4 Approach', justification: 'Suspensión hacia el dominante' });
            }
        }
        
        if (prevChord.analysis?.roman === 'I' && nextChord.analysis.roman === 'vi') {
            const thirdOfPrev = transposeNote(prevChord.rootNote, 4);
            const passingChord = parseChordString(`${prevChord.rootNote}/${thirdOfPrev}`);
            if (passingChord) suggestions.push({ chord: passingChord, technique: 'Bajo de Paso por Inversión', justification: `I en 1ra inversión.` });
            
            const dominantOfPrev = transposeNote(prevChord.rootNote, 7);
            const thirdOfDominant = transposeNote(dominantOfPrev, 4);
            const passingChordV7 = parseChordString(`${dominantOfPrev}7/${thirdOfDominant}`);
            if (passingChordV7) suggestions.push({ chord: passingChordV7, technique: 'Bajo de Paso Cromático', justification: `V7 en 1ra inversión.` });
        }
        
        if (!['I', 'i', 'vii°'].includes(nextChord.analysis.roman)) {
            const targetRoot = nextChord.rootNote;
            const relatedTwoRoot = transposeNote(targetRoot, 2);
            const targetIsMajorOrDominant = isMajorFamily(nextChord.type) || isDominantFamily(nextChord.type);
            const relatedTwoType = targetIsMajorOrDominant ? 'm7' : 'm7b5';
            const relatedTwoChord = parseChordString(`${relatedTwoRoot}${relatedTwoType}`);
            if (relatedTwoChord) suggestions.push({ chord: relatedTwoChord, technique: 'II-V Relacionado (el II)', justification: `Inicia II-V hacia ${formatChordName(nextChord, { style: 'short' })}.` });
        }

        suggestions.push(...this.getBassLineMelodicPassing(prevChord, nextChord, key, settings));
        suggestions.push(...this.getBackdoorPassing(prevChord, nextChord, key, settings));

        // Tritono del passing chord si es dominante - Gap 5
        const tritoneSuggestions: ChordSuggestion[] = [];
        for (const s of suggestions) {
            if (isDominantFamily(s.chord.type)) {
                const tritoneRoot = transposeNote(s.chord.rootNote, 6);
                const tritoneChord = parseChordString(`${tritoneRoot}7`);
                if (tritoneChord) {
                    tritoneSuggestions.push({
                        chord: tritoneChord,
                        technique: 'Tritono del Acorde de Paso',
                        justification: `Sustituto tritono del paso ${formatChordName(s.chord, { style: 'short' })}`
                    });
                }
            }
        }
        suggestions.push(...tritoneSuggestions);

        return this.scoreByVoiceLeading(suggestions.filter((suggestion, index, self) =>
            index === self.findIndex((s) => (
                formatChordName(s.chord, { style: 'short' }) === formatChordName(suggestion.chord, { style: 'short' })
            ))
        ), prevChordItem, settings);
    }

    public applyGlobalReharmonization(progression: SequenceItem[], key: DetectedKey, settings: ReharmonizationSettings): ProcessedSong {
        console.log(`Aplicando rearmonización global en la tonalidad de ${key.key} ${key.scale} con los ajustes:`, settings);
        
        // Gap 7 & 8: Pipeline completo
        let newProgression: SequenceItem[] = [];
        
        for (let i = 0; i < progression.length; i++) {
            const current = progression[i];
            const next = progression[i + 1];

            // 1. Extender y colorear el acorde actual
            let suggestedCurrent = current;
            const currentSuggs = this.getSuggestionsForChord(current, key, undefined, settings);
            const extSugg = currentSuggs.find(s => s.technique.includes('Extens') || s.technique.includes('Color') || s.technique.includes('Gospel') || s.technique.includes('Bolero'));
            if (extSugg && settings.density !== 'low') {
                suggestedCurrent = extSugg.chord;
            }
            newProgression.push(suggestedCurrent);

            // 2. Insertar passing chords
            if (next) {
                const passSuggs = this.getPassingChordSuggestions(suggestedCurrent, next, key, settings);
                if (passSuggs.length > 0) {
                    if (settings.density === 'high') {
                        // Insertamos el passing chord más alto calificado
                        newProgression.push(passSuggs[0].chord);
                    } else if (settings.density === 'medium' && i % 2 === 0) {
                        // Densidad media: menos frecuente
                        newProgression.push(passSuggs[0].chord);
                    }
                }
            }
        }

        const reharmonizedChords = newProgression.map(chord => {
            return { chord: chord, position: 0 };
        });

        return { lines: [{ lyrics: '', chords: reharmonizedChords }], allChords: newProgression };
    }
}

export const IntelliHarmonix = new IntelliHarmonixEngine();
