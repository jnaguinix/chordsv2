# Chords App — Manual para IA

Guía técnica compacta para continuar el desarrollo sin leer el código desde cero.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | React 19 con Hooks |
| Lenguaje | TypeScript |
| Build | Vite |
| CSS | UnoCSS (atómico) + CSS global en `src/index.css` y `src/App.css` |
| Editor | CodeMirror 6 con gramática personalizada de acordes |
| Audio | Tone.js — sampler de piano Salamander (remoto, carga asíncrona) |

**Comando de desarrollo:** `npm run dev`  
**No hay tests automatizados.**

---

## Estructura de archivos relevantes

```
src/
├── App.tsx                          # Orquestador: estado global (useReducer), routing de modos
├── App.css                          # Estilos: header del editor, botones de control, popover, toast
├── index.css                        # Estilos: piano, modal inspector, selectores, song-sheet
├── main.tsx                         # Entry point
├── types/index.ts                   # Tipos TypeScript (SequenceItem, SongLine, etc.)
├── components/
│   ├── Navbar.tsx                   # Tabs: visualizer | editor
│   ├── SongEditor.tsx               # Editor CodeMirror — corazón del modo editor
│   ├── ChordInspectorModal.tsx      # Modal de edición de acordes (long-press)
│   ├── ChordPopover.tsx             # Popover de sugerencias (doble click)
│   ├── PianoDisplay.tsx             # Piano decorativo en el header (chord hover)
│   └── VisualizerMode.tsx           # Modo visualizador de acordes individuales
└── utils/
    ├── constants.ts                 # CHORD_DEFINITIONS, NOTE_TO_INDEX, intervalos, etc.
    ├── chord-utils.ts               # Lógica pura: parse, format, transpose, getChordNotes
    ├── audio.ts                     # AudioEngine (Tone.js), initAudio()
    ├── piano-renderer.ts            # createPiano(), createSongSheet(), populateNoteSelector()
    ├── sheet-manager.ts             # SheetManager — clase para renderizar partitura HTML clásica
    ├── transposition-manager.ts     # TranspositionManager — botones −/+ de transposición
    └── reharmonization-engine.ts    # IntelliHarmonix — sugerencias de rearmonización
```

---

## Tipos clave (`src/types/index.ts`)

```ts
// Unidad fundamental: un acorde con todas sus propiedades
type SequenceItem = {
  id?: number;
  raw?: string;           // texto original del editor
  rootNote: string;       // 'C', 'F#', 'Bb', etc.
  type: string;           // id del acorde según CHORD_DEFINITIONS, ej: 'Mayor', 'm7', 'maj7'
  bassNote?: string;      // nota de bajo explícita (notación /X)
  inversion?: number;     // 0=fundamental, 1=1ª inversión, etc.
  alterations?: string[]; // ['b5', '#9', '#11', ...]
  additions?: string[];   // ['add(9)', 'add(11)', 'add(6)']
  position?: number;      // posición en la línea (uso interno)
};
```

Los demás tipos (`SongLine`, `ProcessedSong`, `DetectedKey`, `ChordSuggestion`) están en el mismo archivo y son autodescriptivos.

---

## Flujo de datos en App.tsx

`App.tsx` usa `useReducer` con un único `AppState`. Las acciones relevantes:

| Acción | Efecto |
|--------|--------|
| `SET_MODE` | Cambia entre `'editor'` y `'visualizer'` |
| `SHOW_INSPECTOR` / `HIDE_INSPECTOR` | Abre/cierra `ChordInspectorModal` |
| `SET_ACTIVE_CHORD` | Actualiza el piano del header (hover) |
| `SET_TRANSPOSITION_OFFSET` | Desplaza todos los acordes N semitonos |
| `SET_SONG_DOC` | Actualiza el texto plano de la canción |
| `SHOW_SUGGESTIONS` / `HIDE_SUGGESTIONS` | Controla `ChordPopover` |
| `IMPORT_SONG` | Carga un `.chord` (JSON) |
| `SHOW_TOAST` / `HIDE_TOAST` | Notificación flotante (auto-dismiss 3 s) |

---

## SongEditor — cómo funciona CodeMirror

El editor vive en `src/components/SongEditor.tsx`.

**Gramática personalizada** (`chordLanguage`):
- Línea que solo contiene acordes → tokens `chord` (azul)
- Cualquier otra línea → token `lyric` (blanco)
- Regex de línea de acordes: `chordLineRegex` — usar **siempre** esta regex para detectar líneas de acordes, nunca `/^[A-G]/`

**Interacciones:**
- **Click simple** en acorde → reproduce audio + muestra en piano del header
- **Long-press (700 ms)** en acorde → abre `ChordInspectorModal`
- **Doble click** en acorde → abre `ChordPopover` con sugerencias de rearmonización
- **Doble click** en espacio entre acordes → sugerencias de acordes de paso

**Patrón de callbacks (`cbRef`):**  
Los plugins de CodeMirror se crean **una sola vez**. Todos los callbacks se leen de `cbRef.current` (actualizado en cada render del componente). Nunca usar `StateEffect.reconfigure` para actualizar callbacks — modificar el ref es suficiente.

---

## chord-utils.ts — funciones principales

| Función | Qué hace |
|---------|---------|
| `parseChordString(str)` | `"Am7/G"` → `SequenceItem` (o `null` si no es acorde válido) |
| `formatChordName(item, {style}, offset?)` | `SequenceItem` → string. `style:'short'` para el editor, `style:'long'` para texto legible |
| `getChordNotes(item, offset?)` | Devuelve `{notesToPress, bassNoteIndex, allNotesForRange}` como índices MIDI absolutos |
| `transposeNote(note, semitones)` | `"C"`, `+2` → `"D"` |
| `transposeChord(item, semitones)` | Transpone rootNote y bassNote de un SequenceItem |
| `calculateOptimalPianoRange(notes, minWhiteKeys, padding)` | Calcula `{startNote, endNote}` para `createPiano()` |

**Notación de inversiones:** se almacenan como superíndices Unicode (`Am¹`, `C²`). `parseChordString` los lee correctamente.

---

## constants.ts — fuente de verdad de acordes

`CHORD_DEFINITIONS` es el array maestro. De él se derivan en runtime:
- `MUSICAL_INTERVALS` — `{id: intervals[]}` para cálculo de notas
- `CHORD_TYPE_MAP` — `{símbolo/alias: id}` para parseo
- `CHORD_TYPE_TO_SHORT_SYMBOL` — `{id: símbolo}` para formato
- `CHORD_TYPE_TO_READABLE_NAME` — `{id: nombre legible}`

**Para añadir un tipo de acorde nuevo:** solo agregar una entrada a `CHORD_DEFINITIONS`. Todo lo demás se auto-genera.

---

## Audio

`AudioEngine` carga un sampler Salamander (piano real) desde `tonejs.github.io` al construirse.  
El contexto de audio **debe iniciarse con un gesto del usuario** — `App.tsx` llama `initAudio()` en el primer `onClick` del documento.  
API pública: `audioEngine.playChord(item, transpositionOffset?)`, `audioEngine.playNote(index, duration?)`.

---

## CSS — convenciones

- **UnoCSS** (Tailwind-like) en el JSX: `className="flex gap-3 mb-2"`, etc.
- **Clases globales** en `index.css`: piano, modal inspector, song-sheet
- **Clases de la app** en `App.css`: header del editor, botones de control (`ctrl-btn`), chord popover, toast

**Paleta de colores usada:**
| Uso | Valor |
|-----|-------|
| Fondo principal | `#1e1e1e` / `rgba(22,22,26,...)` |
| Verde acento | `#99ff33` (brand-green) |
| Azul acordes | `#60a5fa` / `#6cb2f7` |
| Naranja bajo/activo | `#f97316` |
| Rojo destructivo | `#f87171` |

**Estilo del modal inspector** imita al `ChordPopover`:
- `backdrop-filter: blur(16px)`, fondo `rgba(22,22,26,0.97)`
- Borde verde sutil `rgba(153,255,51,0.2)`
- Animación `translateY(-8px) scale(0.97)` → `translateY(0) scale(1)`

---

## ChordInspectorModal — notas de implementación

- Los botones de **Alteraciones** y **Notas Añadidas** son JSX puro (no DOM imperativo).
- Usa **dos estados paralelos**: `editedItem` (sin transposición, lo que se guarda) y `displayedItem` (transpuesto, lo que se muestra al usuario). Los selectores y el piano siempre muestran `displayedItem`; los clicks actualizan `editedItem`.
- Cierra con `Escape` (listener en `useEffect([isVisible])`).
- El piano del modal tiene teclas blancas de `110px` (clase `.inspector-piano-container .piano .white`).

---

## Rearmonización (`reharmonization-engine.ts`)

`IntelliHarmonix` tiene dos métodos públicos:
- `getSuggestionsForChord(chord, key)` → sugerencias para reemplazar un acorde
- `getPassingChordSuggestions(prev, next, key)` → acordes de paso entre dos acordes

Ambos devuelven `ChordSuggestion[]` con `{chord, technique, justification}`.

---

## Archivo de canción (`.chord`)

Es un JSON con esta estructura:
```json
{
  "version": "1.0",
  "metadata": { "title": "...", "artist": "...", "key": "C", "tempo": 120 },
  "songContent": "texto plano con acordes y letras"
}
```
`songContent` es el mismo texto que se escribe directamente en el editor CodeMirror.

---

## Estado del proyecto (mayo 2026)

### Completado y estable (actualizado mayo 2026)
- Editor CodeMirror con gramática personalizada
- Reproducción de acordes con sampler de piano real
- Modal inspector con inversiones, alteraciones y notas añadidas
- Transposición global en tiempo real
- Rearmonización con sugerencias contextuales
- Exportar / Importar `.chord`
- Toast de notificaciones (reemplazó los `alert()`) con auto-dismiss 3 s
- `ChordPopover` posicionado dinámicamente, cierra con Escape y click fuera
- Persistencia de la canción en `localStorage` (clave `chords_song_doc`)
- `AudioEngine` acepta `onError` callback → errores de sampler aparecen como toast
- `initAudio()` devuelve `boolean` — `false` si el contexto de audio falla
- `sheet-manager.ts` eliminado (era código muerto)
- `VisualizerMode`: select de inversiones convertido a JSX con `useMemo`
- Importar el mismo archivo dos veces ya funciona (se limpia `event.target.value`)

### Decisiones de diseño relevantes
- **No hay backend** — todo es client-side
- **No hay router** — navegación por estado (`activeMode`)
- **No hay store externo** — todo el estado global en `useReducer` dentro de `App.tsx`
- Los plugins de CodeMirror usan el patrón `cbRef` para no recrearse en cada render
- `sheet-manager.ts` es código legacy que aún vive pero no se usa en el flujo principal (el editor usa CodeMirror directamente)

### Áreas que podrían mejorarse
- `VisualizerMode.tsx`: los selectores de nota raíz, tipo de acorde y bajo aún usan `populateNoteSelector` / `populateChordTypeSelector` (funciones que manipulan el DOM directamente). Funcionan, pero podrían convertirse a JSX puro si se exponen las opciones desde `constants.ts`
