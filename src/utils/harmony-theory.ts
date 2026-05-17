import type { SequenceItem, DetectedKey, ChordAnalysis } from '../types';
import { NOTE_TO_INDEX, MUSICAL_INTERVALS } from './constants';

export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
export const HARMONIC_MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 11];

export const MAJOR_SCALE_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
export const MINOR_SCALE_DEGREES = ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'];
export const HARMONIC_MINOR_DEGREES = ['i', 'ii°', 'bIII+', 'iv', 'V', 'bVI', 'vii°'];

export const MINOR_FAMILY_IDS = new Set(['Menor', 'm7', 'm9', 'm11', 'm(maj7)', 'm6', 'm7b5', 'madd9']);
export const isMinorFamily = (type: string): boolean => MINOR_FAMILY_IDS.has(type);

export const DOMINANT_FAMILY_IDS = new Set(['7', '9', '13', '11', '7b9', '7#9', '7sus4', '7sus2', '9sus4', '7#5', '7#11', '7alt']);
export const isDominantFamily = (type: string): boolean => DOMINANT_FAMILY_IDS.has(type);

export const MAJOR_FAMILY_IDS = new Set(['Mayor', 'maj7', 'maj9', '6', '6/9', 'maj7#11', 'add9']);
export const isMajorFamily = (type: string): boolean => MAJOR_FAMILY_IDS.has(type);

export const CHORD_TYPE_TO_SCALE: { [type: string]: number[] } = {
    'Mayor':    [0,2,4,5,7,9,11],
    'maj7':     [0,2,4,5,7,9,11],
    'maj9':     [0,2,4,5,7,9,11],
    'maj7#11':  [0,2,4,6,7,9,11],
    '6/9':      [0,2,4,5,7,9,11],
    'Menor':    [0,2,3,5,7,8,10],
    'm7':       [0,2,3,5,7,9,10],
    'm9':       [0,2,3,5,7,9,10],
    'm11':      [0,2,3,5,7,9,10],
    'm(maj7)':  [0,2,3,5,7,8,11],
    '7':        [0,2,4,5,7,9,10],
    '9':        [0,2,4,5,7,9,10],
    '13':       [0,2,4,5,7,9,10],
    '7b9':      [0,1,4,5,7,8,10],
    '7alt':     [0,1,3,4,6,8,10],
    '7#11':     [0,2,4,6,7,9,10],
    'dim7':     [0,2,3,5,6,8,9],
    'm7b5':     [0,2,3,5,6,8,10],
    '9sus4':    [0,2,4,5,7,9,10],
    '7sus4':    [0,2,4,5,7,9,10],
};

export function chordHasInterval(chord: SequenceItem, intervalInSemitones: number): boolean {
    const intervals = MUSICAL_INTERVALS[chord.type];
    if (!intervals) return false;
    return intervals.includes(intervalInSemitones);
}

export function analyzeChordContext(chord: SequenceItem, detectedKey: DetectedKey): ChordAnalysis | null {
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

    return { ...chord, analysis: { degree: '?', roman: '?', func: 'Transition' } };
}
