import { useReducer, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import type { AppMode } from './components/Navbar';
import VisualizerMode from './components/VisualizerMode';
import SongEditor from './components/SongEditor';

import ChordInspectorModal from './components/ChordInspectorModal';
import ChordPopover from './components/ChordPopover'; // Popover inline de sugerencias
import PianoDisplay from './components/PianoDisplay';
import { AudioEngine, initAudio } from './utils/audio';
import { TranspositionManager } from './utils/transposition-manager';
import { IntelliHarmonix } from './utils/reharmonization-engine'; // Importar el motor
import { INDEX_TO_SHARP_NAME } from './utils/constants';
import { formatChordName } from './utils/chord-utils'; // Importar formatChordName
import type { SequenceItem, InspectorCallbacks, ShowInspectorFn, DetectedKey, ChordSuggestion } from './types';
import './App.css';

const sampleSong = `
[Verso 1]
      Am          F      C               G 
Ejemplo de Cancioncita, solo debes añadir la letra de la cancion
  Am7          Fmaj7                   C/E       G/B
Y poner encima los acordes, no es nada complicado o si
`;

// Generar todas las tonalidades posibles para el selector
const ALL_KEYS: DetectedKey[] = [];
for (let i = 0; i < 12; i++) {
    ALL_KEYS.push({ key: INDEX_TO_SHARP_NAME[i], scale: 'Major' });
    ALL_KEYS.push({ key: INDEX_TO_SHARP_NAME[i], scale: 'Minor' });
}

// ============================================================================
// --- ESTADO Y REDUCER ---
// ============================================================================

type InsertionContext = {
  lineIndex: number;
  charIndex: number;
  prevChord: SequenceItem | null;
  nextChord: SequenceItem | null;
};

type AppState = {
  activeMode: AppMode;
  isAudioInitialized: boolean;
  // Inspector
  inspectorVisible: boolean;
  inspectorItem: SequenceItem | null;
  // Chord activo (hover/cursor)
  activeChord: SequenceItem | null;
  // Transposición
  transpositionOffset: number;
  // Canción
  currentSongDoc: string;
  currentKey: DetectedKey;
  // Sugerencias de rearmonización
  isSuggestionModalVisible: boolean;
  suggestions: ChordSuggestion[];
  insertionContext: InsertionContext | null;
  popoverPosition: { x: number; y: number };
  // Notificaciones
  toast: { message: string; type: 'success' | 'error' } | null;
};

const STORAGE_KEY = 'chords_song_doc';

const initialState: AppState = {
  activeMode: 'editor',
  isAudioInitialized: false,
  inspectorVisible: false,
  inspectorItem: null,
  activeChord: null,
  transpositionOffset: 0,
  currentSongDoc: (() => { try { return localStorage.getItem(STORAGE_KEY) ?? sampleSong; } catch { return sampleSong; } })(),
  currentKey: { key: 'C', scale: 'Major' },
  isSuggestionModalVisible: false,
  suggestions: [],
  insertionContext: null,
  popoverPosition: { x: 0, y: 0 },
  toast: null,
};

type AppAction =
  | { type: 'SET_MODE'; payload: AppMode }
  | { type: 'INIT_AUDIO' }
  | { type: 'SHOW_INSPECTOR'; payload: { item: SequenceItem } }
  | { type: 'HIDE_INSPECTOR' }
  | { type: 'SET_ACTIVE_CHORD'; payload: SequenceItem | null }
  | { type: 'SET_TRANSPOSITION_OFFSET'; payload: number }
  | { type: 'SET_SONG_DOC'; payload: string }
  | { type: 'SET_KEY'; payload: DetectedKey }
  | { type: 'SHOW_SUGGESTIONS'; payload: { suggestions: ChordSuggestion[]; insertionContext: InsertionContext | null; position: { x: number; y: number } } }
  | { type: 'HIDE_SUGGESTIONS' }
  | { type: 'IMPORT_SONG'; payload: { songContent: string; key?: DetectedKey } }
  | { type: 'SHOW_TOAST'; payload: { message: string; type: 'success' | 'error' } }
  | { type: 'HIDE_TOAST' };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, activeMode: action.payload };
    case 'INIT_AUDIO':
      return { ...state, isAudioInitialized: true };
    case 'SHOW_INSPECTOR':
      return { ...state, inspectorVisible: true, inspectorItem: action.payload.item };
    case 'HIDE_INSPECTOR':
      return { ...state, inspectorVisible: false };
    case 'SET_ACTIVE_CHORD':
      return { ...state, activeChord: action.payload };
    case 'SET_TRANSPOSITION_OFFSET':
      return { ...state, transpositionOffset: action.payload };
    case 'SET_SONG_DOC':
      try { localStorage.setItem(STORAGE_KEY, action.payload); } catch { /* cuota llena o modo privado */ }
      return { ...state, currentSongDoc: action.payload };
    case 'SET_KEY':
      return { ...state, currentKey: action.payload };
    case 'SHOW_SUGGESTIONS':
      return {
        ...state,
        isSuggestionModalVisible: true,
        suggestions: action.payload.suggestions,
        insertionContext: action.payload.insertionContext,
        popoverPosition: action.payload.position,
      };
    case 'HIDE_SUGGESTIONS':
      return {
        ...state,
        isSuggestionModalVisible: false,
        suggestions: [],
        insertionContext: null,
      };
    case 'IMPORT_SONG':
      try { localStorage.setItem(STORAGE_KEY, action.payload.songContent); } catch { /* cuota llena */ }
      return {
        ...state,
        currentSongDoc: action.payload.songContent,
        currentKey: action.payload.key ?? state.currentKey,
      };
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload };
    case 'HIDE_TOAST':
      return { ...state, toast: null };
    default:
      return state;
  }
}

// ============================================================================
// --- COMPONENTE PRINCIPAL ---
// ============================================================================

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [audioEngine, setAudioEngine] = useReducer(
    (_: AudioEngine | null, next: AudioEngine | null) => next, null
  );

  // Los callbacks contienen closures dinámicas, así que se mantienen como refs
  const inspectorCallbacksRef = useRef<InspectorCallbacks>({});
  const chordToReharmonizeRef = useRef<{ chord: SequenceItem; callback: (newChord: SequenceItem) => void } | null>(null);

  const displayRef = useRef<HTMLDivElement>(null);
  const transpositionManagerRef = useRef<TranspositionManager | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const engine = new AudioEngine((msg) =>
      dispatch({ type: 'SHOW_TOAST', payload: { message: msg, type: 'error' } })
    );
    setAudioEngine(engine);
  }, []);

  useEffect(() => {
    if (displayRef.current && !transpositionManagerRef.current && state.activeMode === 'editor') {
      transpositionManagerRef.current = new TranspositionManager(
        displayRef.current,
        () => {
          const newOffset = transpositionManagerRef.current?.getOffset() || 0;
          dispatch({ type: 'SET_TRANSPOSITION_OFFSET', payload: newOffset });
        }
      );
    }
  }, [state.activeMode]);

  useEffect(() => {
    if (!state.toast) return;
    const id = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
    return () => clearTimeout(id);
  }, [state.toast]);

  const handleFirstInteraction = useCallback(async () => {
    if (!state.isAudioInitialized) {
      const ok = await initAudio();
      if (!ok) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'No se pudo inicializar el audio', type: 'error' } });
        return;
      }
      dispatch({ type: 'INIT_AUDIO' });
    }
  }, [state.isAudioInitialized]);

  const showInspector: ShowInspectorFn = (item, callbacks = {}) => {
    inspectorCallbacksRef.current = callbacks;
    dispatch({ type: 'SHOW_INSPECTOR', payload: { item } });
  };

  const handleSaveInspector = (updatedItem: SequenceItem) => {
    inspectorCallbacksRef.current.onUpdate?.(updatedItem);
    dispatch({ type: 'HIDE_INSPECTOR' });
  };

  const handleDeleteInspector = (itemToDelete: SequenceItem) => {
    inspectorCallbacksRef.current.onDelete?.(itemToDelete);
    dispatch({ type: 'HIDE_INSPECTOR' });
  };

  const handleInsertInspector = (itemToInsert: SequenceItem) => {
    inspectorCallbacksRef.current.onInsert?.(itemToInsert);
    dispatch({ type: 'HIDE_INSPECTOR' });
  };

  const handleTransposeUp = useCallback(() => {
    transpositionManagerRef.current?.up();
  }, []);

  const handleTransposeDown = useCallback(() => {
    transpositionManagerRef.current?.down();
  }, []);

  const handleTransposeReset = useCallback(() => {
    transpositionManagerRef.current?.reset();
  }, []);

  const handleExport = useCallback(() => {
    const songData = {
      version: "1.0",
      metadata: {
        title: "Mi Canción Exportada",
        artist: "Desconocido",
        key: state.currentKey.key,
        tempo: 120
      },
      songContent: state.currentSongDoc
    };
    const jsonString = JSON.stringify(songData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mi_cancion.chord";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.currentSongDoc, state.currentKey]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const songData = JSON.parse(content);
          if (songData && songData.songContent) {
            let importedKey: DetectedKey | undefined;
            if (songData.metadata?.key) {
              const keyExists = ALL_KEYS.some(k => k.key === songData.metadata.key && k.scale === (songData.metadata.scale || 'Major'));
              if (keyExists) {
                importedKey = { key: songData.metadata.key, scale: songData.metadata.scale || 'Major' };
              }
            }
            dispatch({ type: 'IMPORT_SONG', payload: { songContent: songData.songContent, key: importedKey } });
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Canción importada exitosamente', type: 'success' } });
          } else {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Formato de archivo .chord inválido', type: 'error' } });
          }
        } catch (error) {
          console.error("Error al importar la canción:", error);
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'Error al leer el archivo. ¿Es un .chord válido?', type: 'error' } });
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  }, []);

  // --- Funciones para rearmonización ---
  const handleKeyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const [key, scale] = event.target.value.split('-');
    dispatch({ type: 'SET_KEY', payload: { key, scale: scale as 'Major' | 'Minor' } });
  };

  const handleReharmonizeClick = (chord: SequenceItem, callback: (newChord: SequenceItem) => void, position: { x: number; y: number }) => {
    chordToReharmonizeRef.current = { chord, callback };
    const suggestions = IntelliHarmonix.getSuggestionsForChord(chord, state.currentKey);
    dispatch({ type: 'SHOW_SUGGESTIONS', payload: { suggestions, insertionContext: null, position } });
  };

  const handleReharmonizeSpaceClick = (_lineIndex: number, charIndex: number, prevChord: SequenceItem | null, nextChord: SequenceItem | null, position: { x: number; y: number }) => {
    chordToReharmonizeRef.current = null;
    const suggestions = IntelliHarmonix.getPassingChordSuggestions(prevChord!, nextChord!, state.currentKey);
    dispatch({
      type: 'SHOW_SUGGESTIONS',
      payload: {
        suggestions,
        insertionContext: { lineIndex: _lineIndex, charIndex, prevChord, nextChord },
        position,
      },
    });
  };

  const handleSuggestionClick = (suggestedChord: SequenceItem) => {
    if (chordToReharmonizeRef.current) {
      // Caso: Reemplazar un acorde existente
      chordToReharmonizeRef.current.callback(suggestedChord);
    } else if (state.insertionContext) {
      // Caso: Insertar un acorde de paso
      const { lineIndex, charIndex } = state.insertionContext;
      const currentDocLines = state.currentSongDoc.split('\n');
      const targetLine = currentDocLines[lineIndex];

      if (targetLine !== undefined) {
        const newChordText = formatChordName(suggestedChord, { style: 'short' });
        const chordLen = newChordText.length;
        
        // Sobreescribir espacios en la posición, sin desplazar los acordes existentes.
        // Buscamos cuántos espacios hay disponibles en la posición para sobreescribir.
        let availableSpaces = 0;
        for (let k = charIndex; k < targetLine.length; k++) {
          if (targetLine[k] === ' ') availableSpaces++;
          else break;
        }

        let newLine: string;
        if (availableSpaces >= chordLen) {
          // Hay suficientes espacios: sobreescribimos exactamente los que necesitamos
          newLine = targetLine.slice(0, charIndex) + newChordText + targetLine.slice(charIndex + chordLen);
        } else if (availableSpaces >= chordLen - 1) {
          // Casi suficientes: dejamos sin espacio de padding (aceptable)
          newLine = targetLine.slice(0, charIndex) + newChordText + targetLine.slice(charIndex + availableSpaces);
        } else {
          // No hay suficiente espacio: insertamos pero tratamos de minimizar el desplazamiento
          // Sobreescribimos los espacios que haya y solo agregamos los caracteres que faltan
          const overflow = chordLen - availableSpaces;
          newLine = targetLine.slice(0, charIndex) + newChordText + targetLine.slice(charIndex + availableSpaces);
          // Compensar: quitar espacios sobrantes después del acorde insertado si los hay
          const afterInsert = charIndex + chordLen;
          if (afterInsert < newLine.length) {
            let spacesToRemove = 0;
            for (let k = afterInsert; k < newLine.length && spacesToRemove < overflow; k++) {
              if (newLine[k] === ' ') spacesToRemove++;
              else break;
            }
            if (spacesToRemove > 0) {
              newLine = newLine.slice(0, afterInsert) + newLine.slice(afterInsert + spacesToRemove);
            }
          }
        }
        
        currentDocLines[lineIndex] = newLine;
        dispatch({ type: 'SET_SONG_DOC', payload: currentDocLines.join('\n') });
      }
    }
    dispatch({ type: 'HIDE_SUGGESTIONS' });
    chordToReharmonizeRef.current = null;
  };

  const handleSetActiveChord = useCallback((chord: SequenceItem | null) => {
    dispatch({ type: 'SET_ACTIVE_CHORD', payload: chord });
  }, []);

  const handleSetSongDoc = useCallback((doc: string) => {
    dispatch({ type: 'SET_SONG_DOC', payload: doc });
  }, []);

  const renderActiveMode = () => {
    if (!audioEngine) return <div>Cargando motor de audio...</div>;

    switch (state.activeMode) {
      case 'visualizer':
        return <VisualizerMode audioEngine={audioEngine} showInspector={showInspector} />;
      case 'editor':
        return <SongEditor 
                  initialDoc={state.currentSongDoc} 
                  audioEngine={audioEngine} 
                  showInspector={showInspector} 
                  onChordHover={handleSetActiveChord} 
                  transpositionOffset={state.transpositionOffset}
                  onDocChange={handleSetSongDoc}
                  onReharmonizeClick={handleReharmonizeClick}
                  onReharmonizeSpaceClick={handleReharmonizeSpaceClick}
               />;
      default:
        return <VisualizerMode audioEngine={audioEngine} showInspector={showInspector} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-dark-main" onClick={handleFirstInteraction}>
      <Navbar activeMode={state.activeMode} onModeChange={(mode) => dispatch({ type: 'SET_MODE', payload: mode })} />

      {state.activeMode === 'editor' && (
        <>
          <div className="editor-header-row">
            <PianoDisplay chord={state.activeChord} transpositionOffset={state.transpositionOffset} />
            <div className="editor-controls-panel">
              <div className="transpose-row">
                <div className="ctrl-segment">
                  <button className="ctrl-btn seg-left" onClick={handleTransposeDown} title="Bajar medio tono">−</button>
                  <div ref={displayRef} className="ctrl-display">Original</div>
                  <button className="ctrl-btn seg-right" onClick={handleTransposeUp} title="Subir medio tono">+</button>
                </div>
                <button className="ctrl-btn muted" onClick={handleTransposeReset}>Reset</button>
              </div>
              <div className="actions-row">
                <button className="ctrl-btn ghost" onClick={handleExport}>
                  <span className="ctrl-icon">↓</span> Exportar
                </button>
                <button className="ctrl-btn ghost" onClick={handleImportClick}>
                  <span className="ctrl-icon">↑</span> Importar
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".chord,application/json"
                  style={{ display: 'none' }}
                />
                <div className="ctrl-divider"></div>
                <div className="selector-inline">
                    <select
                        id="key-select"
                        value={`${state.currentKey.key}-${state.currentKey.scale}`}
                        onChange={handleKeyChange}
                        className="ctrl-select"
                        title="Tonalidad"
                    >
                        {ALL_KEYS.map(k => (
                            <option key={`${k.key}-${k.scale}`} value={`${k.key}-${k.scale}`}>
                                {k.key} {k.scale}
                            </option>
                        ))}
                    </select>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <main className="main-content">
        {renderActiveMode()}
      </main>

      {audioEngine && (
        <ChordInspectorModal
          isVisible={state.inspectorVisible}
          onClose={() => dispatch({ type: 'HIDE_INSPECTOR' })}
          item={state.inspectorItem}
          onSave={handleSaveInspector}
          onDelete={handleDeleteInspector}
          onInsert={handleInsertInspector}
          audioEngine={audioEngine}
          transpositionOffset={state.transpositionOffset}
        />
      )}

      {state.toast && (
        <div className={`toast toast-${state.toast.type}`}>{state.toast.message}</div>
      )}

      {/* Popover inline de sugerencias */}
      <ChordPopover
        isVisible={state.isSuggestionModalVisible}
        onClose={() => dispatch({ type: 'HIDE_SUGGESTIONS' })}
        suggestions={state.suggestions}
        onSuggestionClick={handleSuggestionClick}
        activeChord={chordToReharmonizeRef.current?.chord ?? null}
        position={state.popoverPosition}
        audioEngine={audioEngine}
      />
    </div>
  );
}

export default App;
