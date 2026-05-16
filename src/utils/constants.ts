/*
================================================================================
|                              constants.ts                                    |
|         (Versión refactorizada con una única fuente de verdad)               |
================================================================================
*/

// --- ESTRUCTURAS BÁSICAS DE NOTAS ---
export const NOTE_TO_INDEX: { [key: string]: number } = {
    'C': 0, 'B#': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
    'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11,
};

export const INDEX_TO_SHARP_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const INDEX_TO_FLAT_NAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false];
export const NOTE_NAME_SPANISH: { [key: string]: string } = { 'C': 'Do', 'C#': 'Do sostenido', 'Db': 'Re bemol', 'D': 'Re', 'D#': 'Re sostenido', 'Eb': 'Mi bemol', 'E': 'Mi', 'F': 'Fa', 'F#': 'Fa sostenido', 'Gb': 'Sol bemol', 'G': 'Sol', 'G#': 'Sol sostenido', 'Ab': 'La bemol', 'A': 'La', 'A#': 'La sostenido', 'Bb': 'Si bemol', 'B': 'Si' };


// --- NUEVA FUENTE DE LA VERDAD PARA ACORDES: Un Array para garantizar el orden ---
interface ChordDefinition {
  id: string; // La clave interna, ej: 'Menor'
  name: string;
  symbol: string;
  intervals: number[];
  aliases?: string[];
  uiGroup: string;
  uiText: string | null; 
}

export const CHORD_DEFINITIONS: ChordDefinition[] = [
    // Tríadas
    { id: 'Mayor',      name: 'Mayor',         symbol: '',      intervals: [0, 4, 7],  aliases: ['M', 'Ma'],         uiGroup: 'Tríadas', uiText: 'Mayor' },
    { id: 'Menor',      name: 'Menor',         symbol: 'm',     intervals: [0, 3, 7],  aliases: ['min', '-', 'mi'],  uiGroup: 'Tríadas', uiText: 'm' },
    { id: '5',          name: '5 (Power Chord)', symbol: '5',   intervals: [0, 7],                            uiGroup: 'Tríadas', uiText: '5' },
    { id: 'Aumentado',  name: 'Aumentado',     symbol: 'aug',   intervals: [0, 4, 8],  aliases: ['+'],         uiGroup: 'Tríadas', uiText: 'aug / +' },
    { id: 'Disminuido', name: 'Disminuido',    symbol: 'dim',   intervals: [0, 3, 6],  aliases: ['°', 'o'],    uiGroup: 'Tríadas', uiText: 'dim / °' },
    // Sextas
    { id: '6',          name: 'Sexta',         symbol: '6',     intervals: [0, 4, 7, 9],                      uiGroup: 'Sextas', uiText: '6' },
    { id: 'm6',         name: 'Menor Sexta',   symbol: 'm6',    intervals: [0, 3, 7, 9],                      uiGroup: 'Sextas', uiText: 'm6' },
    // Séptimas
    { id: '7',          name: '7 (Dominante)', symbol: '7',     intervals: [0, 4, 7, 10],                     uiGroup: 'Séptimas', uiText: '7 (Dominante)' },
    { id: 'm7',         name: 'Menor Séptima', symbol: 'm7',    intervals: [0, 3, 7, 10],  aliases: ['mi7'],   uiGroup: 'Séptimas', uiText: 'm7' },
    { id: 'maj7',       name: 'Mayor Séptima', symbol: 'maj7',  intervals: [0, 4, 7, 11], aliases: ['M7', 'Δ7', 'Δ', 'Ma7'], uiGroup: 'Séptimas', uiText: 'maj7' },
    { id: 'm(maj7)',    name: 'Menor (con 7ma Mayor)', symbol: 'm(maj7)', intervals: [0, 3, 7, 11],           uiGroup: 'Séptimas', uiText: 'm(maj7)' },
    { id: '7#5',        name: 'Dominante Aumentado', symbol: '7(#5)', intervals: [0, 4, 8, 10], aliases: ['aug7', '+7'], uiGroup: 'Séptimas', uiText: '7#5 (aug7)' },
    { id: 'dim7',       name: 'Disminuido 7',  symbol: 'dim7',  intervals: [0, 3, 6, 9],  aliases: ['°7', 'o7'],  uiGroup: 'Séptimas', uiText: '°7 (dim7)' },
    { id: 'm7b5',       name: 'Semidisminuido 7', symbol: 'm7b5', intervals: [0, 3, 6, 10], aliases: ['ø7', 'ø', 'Ø7', 'Ø'], uiGroup: 'Séptimas', uiText: 'ø7 (m7b5)' },
    // Novenas
    { id: '9',          name: 'Novena',        symbol: '9',     intervals: [0, 4, 7, 10, 14],                 uiGroup: 'Novenas', uiText: '9' },
    { id: 'm9',         name: 'Menor Novena',  symbol: 'm9',    intervals: [0, 3, 7, 10, 14],                 uiGroup: 'Novenas', uiText: 'm9' },
    { id: 'maj9',       name: 'Mayor Novena',  symbol: 'maj9',  intervals: [0, 4, 7, 11, 14],                 uiGroup: 'Novenas', uiText: 'maj9' },
    { id: 'add9',       name: 'Mayor con Novena Añadida', symbol: 'add9', intervals: [0, 4, 7, 14],            uiGroup: 'Novenas', uiText: 'add9' },
    { id: 'madd9',      name: 'Menor con Novena Añadida', symbol: 'madd9', intervals: [0, 3, 7, 14],           uiGroup: 'Novenas', uiText: null },
    { id: '7b9',        name: '7ma con 9na bemol', symbol: '7(b9)', intervals: [0, 4, 7, 10, 13],             uiGroup: 'Novenas', uiText: '7b9' },
    { id: '7#9',        name: '7ma con 9na aumentada', symbol: '7(#9)', intervals: [0, 4, 7, 10, 15],         uiGroup: 'Novenas', uiText: '7#9' },
    // Otras Extensiones
    { id: '6/9',        name: 'Sexta/Novena',  symbol: '6/9',   intervals: [0, 4, 7, 9, 14],                  uiGroup: 'Otras Extensiones', uiText: '6/9' },
    { id: '11',         name: 'Onceava (Dominante)', symbol: '11', intervals: [0, 4, 7, 10, 14, 17],           uiGroup: 'Otras Extensiones', uiText: '11' },
    { id: 'm11',        name: 'Menor Onceava', symbol: 'm11',   intervals: [0, 3, 7, 10, 14, 17],             uiGroup: 'Otras Extensiones', uiText: 'm11' },
    { id: '13',         name: 'Treceava',      symbol: '13',    intervals: [0, 4, 7, 10, 14, 21],             uiGroup: 'Otras Extensiones', uiText: '13' },
    { id: '7#11',       name: 'Dominante con 11na aumentada', symbol: '7(#11)', intervals: [0, 4, 7, 10, 18], uiGroup: 'Otras Extensiones', uiText: '7#11' },
    { id: 'maj7#11',    name: 'Maj7 con 11na aumentada', symbol: 'maj7(#11)', intervals: [0, 4, 7, 11, 18],   uiGroup: 'Otras Extensiones', uiText: null },
    // Suspendidos
    { id: 'sus2',       name: 'Suspendido 2',  symbol: 'sus2',  intervals: [0, 2, 7],                         uiGroup: 'Suspendidos', uiText: 'sus2' },
    { id: 'sus4',       name: 'Suspendido 4',  symbol: 'sus4',  intervals: [0, 5, 7],                         uiGroup: 'Suspendidos', uiText: 'sus4' },
    { id: '7sus2',      name: '7ma Suspendido 2', symbol: '7sus2', intervals: [0, 2, 7, 10],                   uiGroup: 'Suspendidos', uiText: '7sus2' },
    { id: '7sus4',      name: '7ma Suspendido 4', symbol: '7sus4', intervals: [0, 5, 7, 10],                   uiGroup: 'Suspendidos', uiText: '7sus4' },
    { id: '9sus4',      name: '9na Suspendido 4', symbol: '9sus4', intervals: [0, 5, 7, 10, 14],               uiGroup: 'Suspendidos', uiText: '9sus4' },
];

// --- MAPAS GENERADOS AUTOMÁTICAMENTE ---

export const MUSICAL_INTERVALS: { [key: string]: number[] } = {};
export const CHORD_TYPE_MAP: { [key: string]: string } = {};
export const CHORD_TYPE_TO_SHORT_SYMBOL: { [key: string]: string } = {};
export const CHORD_TYPE_TO_READABLE_NAME: { [key: string]: string } = {};

CHORD_DEFINITIONS.forEach(def => {
    const key = def.id;
    MUSICAL_INTERVALS[key] = def.intervals;
    CHORD_TYPE_TO_SHORT_SYMBOL[key] = def.symbol;
    CHORD_TYPE_TO_READABLE_NAME[key] = def.name;
    
    CHORD_TYPE_MAP[def.symbol] = key;
    if (def.aliases) {
        for (const alias of def.aliases) {
            CHORD_TYPE_MAP[alias] = key;
        }
    }
});
CHORD_TYPE_MAP[''] = 'Mayor';
CHORD_TYPE_MAP['5 (Power Chord)'] = '5';

// --- Lógica corregida para generar la lista del menú ---
type ChordDisplayItem = { text: string; value: string; isSeparator?: boolean };
export const CHORD_DISPLAY_LIST: ChordDisplayItem[] = [];
let lastGroup = '';

CHORD_DEFINITIONS.forEach(def => {
    if (def.uiText) {
        if (def.uiGroup !== lastGroup) {
            CHORD_DISPLAY_LIST.push({ text: def.uiGroup, isSeparator: true, value: '' });
            lastGroup = def.uiGroup;
        }
        CHORD_DISPLAY_LIST.push({ text: def.uiText, value: def.id });
    }
});
