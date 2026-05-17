# Prompt para Gemini — Motor de Rearmonización Avanzado
> Instrucciones para extender `reharmonization-engine.ts` con vocabulario de Jacob Collier, Cory Henry y Snarky Puppy

---

## ⚠️ REGLAS ABSOLUTAS — LEER ANTES DE ESCRIBIR UNA SOLA LÍNEA

1. **No elimines ninguna función existente.** Las siguientes deben permanecer intactas:
   `getDiatonicSubstitutions`, `getSecondaryDominants`, `getTritoneSubstitution`, `getModalInterchange`, `getStyledVoicings`, `addExtensions`, `getCommonToneSubstitutions`, `getStyleSpecificVocabulary`, `getInversionSuggestions`, `getBassLineMelodicPassing`, `getBackdoorPassing`, `getFullTwoFiveOne`, `scoreByVoiceLeading`, `getSuggestionsForChord`, `getPassingChordSuggestions`, `applyGlobalReharmonization`

2. **No cambies las firmas de los métodos públicos.** `getSuggestionsForChord`, `getPassingChordSuggestions` y `applyGlobalReharmonization` son llamados desde fuera — sus parámetros no pueden cambiar.

3. **No toques `analyzeChordContext`** ni las constantes de escala en la parte superior del archivo.

4. Cada función nueva debe ser un método `private` de la clase `IntelliHarmonixEngine`.

5. Solo modifica `getSuggestionsForChord` agregando llamadas a las funciones nuevas **al final** del array `allSuggestions`, antes del `filter` de unicidad. No muevas ni reordenes las llamadas existentes.

6. Solo modifica `applyGlobalReharmonization` para el **Gap 6**. No toques la lógica de extensión ni de passing chords que ya existe.

---

## GAP 1 — Movimiento de 3ras (Jacob Collier)

### Contexto musical
En vez del movimiento clásico de 4tas/5tas del jazz, mover el centro armónico en intervalos de 3ras crea un sonido flotante y sorpresivo.

- `Cmaj7 → Emaj7 → Abmaj7` = ciclo de 3ras mayores
- `Am7 → Cm7 → Ebm7` = ciclo de 3ras menores
- Como sustitución puntual: el acorde a una 3ra arriba o abajo siempre es un candidato con ese color

### Función a crear
```typescript
private getThirdRelationSubstitutions(
  chord: ChordAnalysis,
  settings: ReharmonizationSettings
): ChordSuggestion[]
```

### Lógica
| Condición | Acción |
|---|---|
| `settings.density` es `'low'` | Retornar `[]` — no activar |
| Acorde es dominante | Retornar `[]` — evita colisiones funcionales |
| Raíz `+4` semitonos, mismo tipo | Etiqueta: `'Relación de 3ras'` — `'Sustituto a 3ra mayor ascendente — color Collier/jazz moderno.'` |
| Raíz `+3` semitonos, mismo tipo | Etiqueta: `'Relación de 3ras'` — `'Sustituto a 3ra menor ascendente — movimiento cromático suave.'` |
| Raíz `-4` semitonos, mismo tipo | Etiqueta: `'Relación de 3ras'` — `'Sustituto a 3ra mayor descendente.'` |

### Integración
```typescript
// En getSuggestionsForChord, antes del filter de unicidad:
allSuggestions.push(...this.getThirdRelationSubstitutions(analyzedChord, settings));
```

---

## GAP 2 — Escalas de acorde para compatibilidad melódica

### Contexto musical
Cada tipo de acorde implica una escala modal específica. Un `C7alt` implica la escala alterada (7º modo de menor melódica). Saber esto permite filtrar sugerencias que chocan con la melodía de forma precisa.

### Constante a agregar
Agregar **fuera de la clase**, antes de `class IntelliHarmonixEngine`:

```typescript
const CHORD_TYPE_TO_SCALE: { [type: string]: number[] } = {
    'Mayor':    [0,2,4,5,7,9,11],   // Jónico
    'maj7':     [0,2,4,5,7,9,11],   // Jónico
    'maj9':     [0,2,4,5,7,9,11],   // Jónico
    'maj7#11':  [0,2,4,6,7,9,11],   // Lidio
    '6/9':      [0,2,4,5,7,9,11],   // Jónico
    'Menor':    [0,2,3,5,7,8,10],   // Eólico
    'm7':       [0,2,3,5,7,9,10],   // Dórico
    'm9':       [0,2,3,5,7,9,10],   // Dórico
    'm11':      [0,2,3,5,7,9,10],   // Dórico
    'm(maj7)':  [0,2,3,5,7,8,11],   // Menor melódica
    '7':        [0,2,4,5,7,9,10],   // Mixolidio
    '9':        [0,2,4,5,7,9,10],   // Mixolidio
    '13':       [0,2,4,5,7,9,10],   // Mixolidio
    '7b9':      [0,1,4,5,7,8,10],   // Dominante disminuido
    '7alt':     [0,1,3,4,6,8,10],   // Alterada (7º menor melódica)
    '7#11':     [0,2,4,6,7,9,10],   // Lidio dominante
    'dim7':     [0,2,3,5,6,8,9],    // Disminuido simétrico
    'm7b5':     [0,2,3,5,6,8,10],   // Locrio
    '9sus4':    [0,2,4,5,7,9,10],   // Mixolidio
    '7sus4':    [0,2,4,5,7,9,10],   // Mixolidio
};
```

### Función a crear
```typescript
private getMelodyCompatibilityScore(
  chordType: string,
  chordRoot: string,
  melodyNote: string
): number
```

### Lógica de scoring
| Condición | Score |
|---|---|
| `melodyNote` undefined o vacío | `0` |
| `chordType` no existe en el mapa | `0` |
| Intervalo es 3ra mayor (`4`) o 3ra menor (`3`) o 7ma menor (`10`) o 7ma mayor (`11`) | `+5` |
| Intervalo está en la escala pero no es 3ra/7ma | `+3` |
| Intervalo **no** está en la escala | `-4` |

### Integración
En `scoreByVoiceLeading`, dentro del bloque `if (melodyNote)` que ya existe, **reemplazar solo el cálculo del score de melodía** con:
```typescript
score += this.getMelodyCompatibilityScore(s.chord.type, s.chord.rootNote, melodyNote);
```
> ⚠️ Mantén intacto el filtrado de disonantes (`isDissonant`) que ya existe — solo mejora el cálculo del score.

---

## GAP 3 — Cadencia círculo de quintas completa (Bolero / Jazz clásico)

### Contexto musical
`I → VI7 → II7 → V7 → I` es el ADN del bolero latinoamericano y la balada romántica. Es un patrón idiomático que debe sugerirse como **bloque completo**, igual que `getFullTwoFiveOne`.

### Función a crear
```typescript
private getCircleOfFifthsCadence(
  chord: ChordAnalysis,
  key: DetectedKey,
  settings: ReharmonizationSettings
): ChordSuggestion[]
```

### Lógica
- Solo activar si `settings.style === 'bolero'` o `settings.style === 'jazz'`
- Solo activar si el acorde es `I` o `i` (tónica)
- Construir los acordes desde `key.key`:

| Acorde | Intervalo desde tónica | Tipo en bolero | Tipo en jazz |
|---|---|---|---|
| `VI7` | `+9` semitonos | `7b9` | `13` |
| `II7` | `+2` semitonos | `7b9` | `9` |
| `V7` | `+7` semitonos | `7b9` | `13` |

- Retornar como un `ChordSuggestion` único:
  - `chords: [VI7, II7, V7]`
  - `technique: 'Círculo de Quintas (I-VI-II-V)'`
  - `justification: 'Cadencia completa del bolero/jazz clásico — resuelve de vuelta al I.'`

### Integración
```typescript
// En getSuggestionsForChord, antes del filter de unicidad:
allSuggestions.push(...this.getCircleOfFifthsCadence(analyzedChord, key, settings));
```

---

## GAP 4 — Vocabulario Cory Henry (Gospel de alta densidad)

### Contexto musical
Cory Henry es gospel orgánico de máxima densidad. Sus sellos armónicos:
- **Clusters 9+3+7**: voicings muy apretados con disonancia que resuelve hacia adentro
- **`IV/I` como reposo**: no es tensión — es el acorde de llegada del gospel moderno
- **Hendrix chord (`7#9`)**: dominante con #9 en contextos funk/gospel
- **Modulación a semitono arriba**: sube la tonalidad un semitono en el clímax emocional

### Función a crear
```typescript
private getCoryHenryVocabulary(
  chord: ChordAnalysis,
  key: DetectedKey,
  settings: ReharmonizationSettings
): ChordSuggestion[]
```

### Lógica (solo activar si `settings.style === 'gospel'`)

**1. Cluster denso 9+3+7**
- Si función es `Tonic` o `Subdominant` y familia mayor o menor
- Sugerir `m9` (para menores) o `maj9` (para mayores)
- Etiqueta: `'Cluster Cory Henry'`
- Justificación: `'Voicing denso 9na+3ra+7ma — gospel de alta densidad.'`

**2. IV/I como reposo**
- Si el acorde es `I` (tónica mayor)
- Construir: `${transposeNote(chord.rootNote, 5)}/${chord.rootNote}`
- Etiqueta: `'Gospel IV/I'`
- Justificación: `'IV sobre bajo de tónica — el acorde de reposo del gospel moderno.'`

**3. Hendrix Chord**
- Si `func === 'Dominant'`
- Construir: `${chord.rootNote}7#9`
- Etiqueta: `'Hendrix Chord'`
- Justificación: `'Dom7#9 — tensión funk/gospel característica de Cory Henry.'`

**4. Modulación a semitono arriba**
- Si `settings.density === 'high'` y el acorde es `I`
- Construir: `${transposeNote(chord.rootNote, 1)}maj7`
- Etiqueta: `'Modulación Cory Henry'`
- Justificación: `'Sube un semitono en el clímax — firma de Cory Henry en adoración gospel.'`

### Integración
```typescript
// En getSuggestionsForChord, antes del filter de unicidad:
allSuggestions.push(...this.getCoryHenryVocabulary(analyzedChord, key, settings));
```

---

## GAP 5 — Vocabulario Snarky Puppy (Jazz fusión / World)

### Contexto musical
Snarky Puppy fusiona jazz, funk y world music. Sus sellos:
- **Lidio dominante (`7#11`)**: dominante que no quiere resolver — color de reposo, no de tensión
- **Poliacordes a semitono**: dos tríadas a semitono crean ambigüedad tonal máxima
- **`sus2` sin resolver**: como acorde de llegada, no de paso
- **Omit3**: acordes sin 3ra para ambigüedad mayor/menor

### Función a crear
```typescript
private getSnarkyPuppyVocabulary(
  chord: ChordAnalysis,
  key: DetectedKey,
  settings: ReharmonizationSettings
): ChordSuggestion[]
```

### Lógica (solo activar si `settings.style === 'neo-soul'` o `settings.style === 'jazz'`)

**1. Lidio dominante**
- Si el acorde es dominante
- Construir: `${chord.rootNote}7#11`
- Etiqueta: `'Lidio Dominante'`
- Justificación: `'7#11 — color Snarky Puppy/jazz fusión, dominante que no quiere resolver.'`

**2. Poliacorde a semitono**
- Si `settings.density === 'high'`
- Construir: `${transposeNote(chord.rootNote, 1)}/${chord.rootNote}`
- Etiqueta: `'Poliacorde'`
- Justificación: `'Dos tríadas a semitono — ambigüedad tonal máxima, muy Snarky Puppy.'`

**3. Sus2 abierto como llegada**
- Si `func === 'Tonic'`
- Construir: `${chord.rootNote}sus2`
- Etiqueta: `'Sus2 Abierto'`
- Justificación: `'Sus2 como acorde de llegada sin 3ra — color abierto y moderno.'`

**4. Omit3 con extensiones**
- Si acorde mayor o menor y `settings.density === 'high'`
- Construir: `${chord.rootNote}add9` (aproximación a omit3)
- Etiqueta: `'Omit3 Snarky'`
- Justificación: `'Sin 3ra — ambigüedad mayor/menor, sonido muy Snarky Puppy/moderno.'`

### Integración
```typescript
// En getSuggestionsForChord, antes del filter de unicidad:
allSuggestions.push(...this.getSnarkyPuppyVocabulary(analyzedChord, key, settings));
```

---

## GAP 6 — Arco narrativo en el pipeline global

### Contexto musical
Una rearmonización profesional tiene narrativa: empieza conservadora, escala tensión, llega a un clímax, y resuelve de forma contundente. El pipeline actual aplica la misma densidad en todos los compases.

### Modificación en `applyGlobalReharmonization`
Solo agrega esta lógica **al inicio del loop existente**, sin tocar nada más:

```typescript
// Calcular posición relativa del acorde en la progresión
const position = progression.length > 1 ? i / (progression.length - 1) : 0;

// Derivar densidad local según arco narrativo
let localDensity: 'low' | 'medium' | 'high';
if (position < 0.25) {
    localDensity = 'low';               // Intro — conservador
} else if (position <= 0.75) {
    localDensity = settings.density;    // Cuerpo — según configuración del usuario
} else if (position <= 0.90) {
    localDensity = 'high';              // Clímax — máxima tensión
} else {
    localDensity = 'low';               // Resolución final — simple y contundente
}

// Usar settingsLocal SOLO dentro de esta iteración
const settingsLocal = { ...settings, density: localDensity };
```

> ⚠️ Usa `settingsLocal` en vez de `settings` solo para las decisiones de cuántos passing chords insertar y qué extensión tomar. **No modifiques el objeto `settings` original.**

---

## Caso de prueba para validar

Usar la progresión que ya existe en el proyecto:

```
Am - F - Cmaj7/E - D7 - Am7 - G
Tonalidad: La menor
Estilo: gospel
Densidad: high
```

### Output esperado de nivel profesional
```
Am(maj7) → [IV/I gospel] → Fmaj7 → [E7b9] →
Cmaj9/E → [Bdim7] → D7#9 → [Gm7 → C13] →
Am11 → [Bb7alt] → Gmaj9/B
```

Cada acorde debe tener `technique` y `justification` poblados. Ningún acorde sugerido debe ser un tipo básico sin extensión cuando el estilo y densidad lo permiten.

---

## Resumen de integraciones en `getSuggestionsForChord`

Al final de `allSuggestions`, antes del `filter` de unicidad, deben quedar en este orden:

```typescript
// (las llamadas existentes se mantienen igual)
allSuggestions.push(...this.getDiatonicSubstitutions(analyzedChord, key, settings));
allSuggestions.push(...this.getTritoneSubstitution(analyzedChord, settings));
allSuggestions.push(...this.getStyledVoicings(analyzedChord, settings));
allSuggestions.push(...this.addExtensions(analyzedChord, key, settings));
allSuggestions.push(...this.getModalInterchange(analyzedChord, key, settings));
allSuggestions.push(...this.getCommonToneSubstitutions(analyzedChord, key, settings));
allSuggestions.push(...this.getStyleSpecificVocabulary(analyzedChord, key, settings));
allSuggestions.push(...this.getInversionSuggestions(analyzedChord, settings, nextChordItem));

// ← NUEVAS (agregar aquí, en este orden)
allSuggestions.push(...this.getThirdRelationSubstitutions(analyzedChord, settings));
allSuggestions.push(...this.getCircleOfFifthsCadence(analyzedChord, key, settings));
allSuggestions.push(...this.getCoryHenryVocabulary(analyzedChord, key, settings));
allSuggestions.push(...this.getSnarkyPuppyVocabulary(analyzedChord, key, settings));
```
