/**
 * Representa un acorde musical individual con todas sus propiedades.
 */
export type SequenceItem = { 
    id?: number;
    raw?: string;
    rootNote: string;
    type: string;
    bassNote?: string;
    inversion?: number;
    alterations?: string[];
    additions?: string[];
    position?: number; // Añadido para el contexto de la línea
};

/**
 * Representa un acorde tal como aparece en una línea de la canción.
 */
export type SongChord = { 
    chord: SequenceItem;
    position: number; 
    isAnnotation?: boolean; 
};

/**
 * Representa una línea completa de una canción, con su letra y los acordes asociados.
 */
export type SongLine = { 
    lyrics: string; 
    chords: SongChord[]; 
    isInstrumental?: boolean; 
};

/**
 * Representa la canción completa procesada, lista para ser usada en la aplicación.
 */
export type ProcessedSong = { 
    lines: SongLine[]; 
    allChords: SequenceItem[]; 
};

/**
 * Define los callbacks que el Chord Inspector puede recibir.
 */
export type InspectorCallbacks = {
    onUpdate?: (updatedItem: SequenceItem) => void;
    onDelete?: (itemToDelete: SequenceItem) => void;
    onInsert?: (item: SequenceItem) => void; 
};

/**
 * Define la firma de la función que abre el Chord Inspector.
 */
export type ShowInspectorFn = (item: SequenceItem, callbacks?: InspectorCallbacks) => void;


// ============================================================================
// --- NUEVOS TIPOS PARA EL MOTOR DE REARMONIZACIÓN ---
// ============================================================================

/**
 * Representa la tonalidad detectada o seleccionada para una canción.
 */
export type DetectedKey = {
    key: string; // ej. 'C'
    scale: 'Major' | 'Minor';
    confidence?: number; // Opcional, para futura detección automática
};

/**
 * Contiene el análisis de un acorde dentro de su contexto tonal.
 */
export type ChordAnalysisResult = {
    degree: string;      // ej. '2'
    roman: string;       // ej. 'ii'
    func: 'Tonic' | 'Subdominant' | 'Dominant' | 'Transition';
};

/**
 * Es un SequenceItem enriquecido con su análisis contextual.
 */
export type ChordAnalysis = SequenceItem & {
    analysis: ChordAnalysisResult | null;
};

/**
 * Define la estructura de una sugerencia de rearmonización.
 */
export type ChordSuggestion = {
    chord: SequenceItem;
    technique: string;   // ej. "Sustitución de Tritono"
    justification: string; // ej. "Crea una línea de bajo cromática."
};

/**
 * Define la estructura de los ajustes para la rearmonización global.
 */
export type StyleVocabulary = 'jazz' | 'gospel' | 'neo-soul' | 'bolero';
export type HarmonicDensity = 'low' | 'medium' | 'high';

export type ReharmonizationSettings = {
    style: StyleVocabulary;
    density: HarmonicDensity;
};
