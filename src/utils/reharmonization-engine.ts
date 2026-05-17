import type { SequenceItem, DetectedKey, ChordSuggestion, ReharmonizationSettings, ProcessedSong } from '../types';
import { NOTE_TO_INDEX } from './constants';
import { transposeNote, parseChordString, formatChordName } from './chord-utils';
import { analyzeChordContext, isMinorFamily, isDominantFamily, isMajorFamily } from './harmony-theory';
import { getDiatonicSubstitutions, getTritoneSubstitution, getModalInterchange, getThirdRelationSubstitutions, getCircleOfFifthsCadence } from './chord-substitutions';
import { getStyledVoicings, addExtensions, getStyleSpecificVocabulary, getCoryHenryVocabulary, getSnarkyPuppyVocabulary } from './style-vocabulary';
import { scoreByVoiceLeading, getInversionSuggestions } from './voice-leading';
import { getSecondaryDominants, getFullTwoFiveOne, getBassLineMelodicPassing, getBackdoorPassing, getCommonToneSubstitutions } from './passing-chords';

class IntelliHarmonixEngine {

    public getSuggestionsForChord(
        chordItem: SequenceItem,
        key: DetectedKey,
        prevChordItem?: SequenceItem,
        settings: ReharmonizationSettings = { style: 'jazz', density: 'medium' },
        melodyNote?: string,
        nextChordItem?: SequenceItem
    ): ChordSuggestion[] {
        const analyzedChord = analyzeChordContext(chordItem, key);
        if (!analyzedChord) return [];

        const allSuggestions: ChordSuggestion[] = [
            ...getDiatonicSubstitutions(analyzedChord, key, settings),
            ...getTritoneSubstitution(analyzedChord, settings),
            ...getStyledVoicings(analyzedChord, settings),
            ...addExtensions(analyzedChord, key, settings),
            ...getModalInterchange(analyzedChord, key, settings),
            ...getCommonToneSubstitutions(analyzedChord, key, settings),
            ...getStyleSpecificVocabulary(analyzedChord, key, settings),
            ...getInversionSuggestions(analyzedChord, settings, nextChordItem),
            ...getThirdRelationSubstitutions(analyzedChord, settings),
            ...getCircleOfFifthsCadence(analyzedChord, key, settings),
            ...getCoryHenryVocabulary(analyzedChord, key, settings),
            ...getSnarkyPuppyVocabulary(analyzedChord, key, settings),
        ];

        const uniqueSuggestions = allSuggestions.filter((suggestion, index, self) =>
            index === self.findIndex((s) => (
                formatChordName(s.chord, { style: 'short' }) === formatChordName(suggestion.chord, { style: 'short' })
            ))
        );

        return prevChordItem
            ? scoreByVoiceLeading(uniqueSuggestions, prevChordItem, settings, melodyNote, nextChordItem)
            : uniqueSuggestions;
    }

    public getPassingChordSuggestions(
        prevChordItem: SequenceItem,
        nextChordItem: SequenceItem,
        key: DetectedKey,
        settings: ReharmonizationSettings = { style: 'jazz', density: 'medium' },
        melodyNote?: string
    ): ChordSuggestion[] {
        const prevChord = analyzeChordContext(prevChordItem, key);
        const nextChord = analyzeChordContext(nextChordItem, key);

        if (!prevChord || !nextChord || !nextChord.analysis) return [];

        const suggestions: ChordSuggestion[] = [];
        const prevRootIndex = NOTE_TO_INDEX[prevChord.rootNote];
        const nextRootIndex = NOTE_TO_INDEX[nextChord.rootNote];

        suggestions.push(...getSecondaryDominants(nextChord, settings));

        if (prevRootIndex !== undefined && nextRootIndex !== undefined) {
            const ascDist = (nextRootIndex - prevRootIndex + 12) % 12;
            const descDist = (prevRootIndex - nextRootIndex + 12) % 12;

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

            if ((settings.style === 'jazz' || settings.style === 'neo-soul') && settings.density === 'high') {
                const approachUp = parseChordString(`${transposeNote(nextChord.rootNote, -1)}7alt`);
                if (approachUp) suggestions.push({ chord: approachUp, technique: 'Aproximación Cromática', justification: 'Aproximación desde abajo' });
            }

            if (settings.density !== 'low' && prevRootIndex !== nextRootIndex) {
                const pedal = parseChordString(`${prevChord.rootNote}/${nextChord.rootNote}`);
                if (pedal) suggestions.push({ chord: pedal, technique: 'Acorde Pedal', justification: 'Mantiene raíz anterior sobre bajo nuevo' });
            }

            if (settings.style === 'bolero' && (ascDist === 2 || descDist === 2)) {
                const aug = parseChordString(`${prevChord.rootNote}aug`);
                if (aug) suggestions.push({ chord: aug, technique: 'Aumentado de Paso', justification: 'Paso suave bolero' });
            }

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

        suggestions.push(...getBassLineMelodicPassing(prevChord, nextChord, key, settings));
        suggestions.push(...getBackdoorPassing(prevChord, nextChord, key, settings));

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
        suggestions.push(...getFullTwoFiveOne(nextChord, key, settings));

        return scoreByVoiceLeading(
            suggestions.filter((suggestion, index, self) =>
                index === self.findIndex((s) => (
                    formatChordName(s.chord, { style: 'short' }) === formatChordName(suggestion.chord, { style: 'short' })
                ))
            ),
            prevChordItem,
            settings,
            melodyNote,
            nextChordItem
        );
    }

    public applyGlobalReharmonization(progression: SequenceItem[], key: DetectedKey, settings: ReharmonizationSettings): ProcessedSong {
        console.log(`Aplicando rearmonización global en la tonalidad de ${key.key} ${key.scale} con los ajustes:`, settings);

        const newProgression: SequenceItem[] = [];

        for (let i = 0; i < progression.length; i++) {
            const current = progression[i];
            const next = progression[i + 1];

            const position = progression.length > 1 ? i / (progression.length - 1) : 0;
            let localDensity: 'low' | 'medium' | 'high';
            if (position < 0.25) {
                localDensity = 'low';
            } else if (position <= 0.75) {
                localDensity = settings.density;
            } else if (position <= 0.90) {
                localDensity = 'high';
            } else {
                localDensity = 'low';
            }

            const settingsLocal = { ...settings, density: localDensity };

            let suggestedCurrent = current;
            const currentSuggs = this.getSuggestionsForChord(current, key, undefined, settingsLocal);
            const extSugg = currentSuggs.find(s =>
                s.technique.includes('Extens') || s.technique.includes('Color') ||
                s.technique.includes('Gospel') || s.technique.includes('Bolero')
            );
            if (extSugg && settingsLocal.density !== 'low') {
                suggestedCurrent = extSugg.chord;
            }
            newProgression.push(suggestedCurrent);

            if (next) {
                const passSuggs = this.getPassingChordSuggestions(suggestedCurrent, next, key, settingsLocal);
                if (passSuggs.length > 0) {
                    const top = passSuggs[0];
                    if (settingsLocal.density === 'high') {
                        if (top.chords) {
                            newProgression.push(...top.chords);
                        } else {
                            newProgression.push(top.chord);
                            if (passSuggs.length > 1 && !passSuggs[1].chords) {
                                newProgression.push(passSuggs[1].chord);
                            }
                        }
                    } else if (settingsLocal.density === 'medium' && i % 2 === 0) {
                        if (top.chords) {
                            newProgression.push(...top.chords);
                        } else {
                            newProgression.push(top.chord);
                        }
                    }
                }
            }
        }

        const reharmonizedChords = newProgression.map(chord => ({ chord, position: 0 }));

        return { lines: [{ lyrics: '', chords: reharmonizedChords }], allChords: newProgression };
    }
}

export const IntelliHarmonix = new IntelliHarmonixEngine();
