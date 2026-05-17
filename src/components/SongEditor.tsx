import React, { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { syntaxTree } from "@codemirror/language";
import type { AudioEngine } from '../utils/audio';
import type { ShowInspectorFn, SequenceItem } from '../types';
import { parseChordString, formatChordName, transposeNote } from '../utils/chord-utils';

const chordTokenRegex = /[A-G](b|#)?[a-zA-Z0-9#b()¹²³⁴⁵⁶⁷⁸⁹]*(\/[A-G](b|#)?)?/;
const chordLineRegex = new RegExp(`^(\\s*${chordTokenRegex.source}\\s*)+$`);

const chordLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && !chordLineRegex.test(stream.string)) {
      stream.skipToEnd();
      return 'lyric';
    }
    if (stream.match(chordTokenRegex)) {
      return 'chord';
    }
    stream.next();
    return null;
  },
  tokenTable: {
    chord: tags.keyword,
    lyric: tags.string,
  }
});

const chordHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, class: 'cm-chord' },
  { tag: tags.string, class: 'cm-lyric' },
]);

const editorTheme = EditorView.theme({
  '&': { fontSize: '32px', fontFamily: 'monospace', backgroundColor: '#1e1e1e', color: '#f8fafc', lineHeight: '1.1' },
  '.cm-content': { caretColor: 'green' },
  '&.cm-focused .cm-cursor': {
    backgroundColor: 'green',
    borderLeft: 'none',
    width: '1ch',
    mixBlendMode: 'difference',
  },
  '.cm-chord': { color: '#60a5fa', fontWeight: 'bold', cursor: 'pointer', padding: '0px 2px', borderRadius: '3px', '&:hover': { backgroundColor: '#27272a' }, fontSize: '0.7em' },
  '.cm-lyric': { color: '#f8fafc' },
});

const findChordAtPosition = (tree: any, pos: number, docLength: number, exact: boolean = false) => {
  let chordNode = tree.resolveInner(pos, 1);

  if (chordNode.type.name !== 'chord' && !exact) {
    for (let offset = 1; offset <= 2 && pos - offset >= 0; offset++) {
      const testNode = tree.resolveInner(pos - offset, 1);
      if (testNode.type.name === 'chord') {
        if (pos <= testNode.to + 1) { chordNode = testNode; break; }
      }
    }

    if (chordNode.type.name !== 'chord') {
      for (let offset = 1; offset <= 2 && pos + offset < docLength; offset++) {
        const testNode = tree.resolveInner(pos + offset, 1);
        if (testNode.type.name === 'chord') {
          if (pos >= testNode.from - 1) { chordNode = testNode; break; }
        }
      }
    }
  }

  return chordNode.type.name === 'chord' ? chordNode : null;
};

// ── Tipo compartido por los plugins (siempre leen del ref) ────────────────────
interface PluginCallbacks {
  audioEngine: AudioEngine;
  showInspector: ShowInspectorFn;
  onChordHover: (chord: SequenceItem | null) => void;
  transpositionOffset: number;
  onDocChange: (doc: string) => void;
  onReharmonizeClick: (chord: SequenceItem, callback: (newChord: SequenceItem) => void, position: { x: number; y: number }) => void;
  onReharmonizeSpaceClick: (lineIndex: number, charIndex: number, prevChord: SequenceItem | null, nextChord: SequenceItem | null, position: { x: number; y: number }) => void;
}

// Los plugins leen cbRef.current, por lo que nunca necesitan recrearse
const chordInteractionPlugin = (
  cbRef: React.MutableRefObject<PluginCallbacks>,
  longPressTimeoutRef: React.MutableRefObject<number | null>,
  clearLongPressTimeout: () => void
) => {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.detail >= 2) {
        event.preventDefault(); // Evita la selección de texto nativa del navegador en doble clic
      }
      const cb = cbRef.current;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;

      const tree = syntaxTree(view.state);
      const chordNode = findChordAtPosition(tree, pos, view.state.doc.length);

      if (chordNode) {
        clearLongPressTimeout();

        const transposedChordText = view.state.sliceDoc(chordNode.from, chordNode.to);
        const parsedChord = parseChordString(transposedChordText);

        if (parsedChord) {
          cb.audioEngine.playChord(parsedChord, 0);
          cb.onChordHover(parsedChord);
        } else {
          cb.onChordHover(null);
        }

        longPressTimeoutRef.current = window.setTimeout(() => {
          if (longPressTimeoutRef.current !== null) {
            longPressTimeoutRef.current = null;

            const text = view.state.sliceDoc(chordNode.from, chordNode.to);
            const parsedTransposedChord = parseChordString(text);
            if (!parsedTransposedChord) return;

            const originalChord = { ...parsedTransposedChord, id: Date.now() };
            originalChord.rootNote = transposeNote(parsedTransposedChord.rootNote, -cbRef.current.transpositionOffset);
            if (parsedTransposedChord.bassNote) {
              originalChord.bassNote = transposeNote(parsedTransposedChord.bassNote, -cbRef.current.transpositionOffset);
            }

            cbRef.current.showInspector(originalChord, {
              onUpdate: (updatedItem: SequenceItem) => {
                const formatted = formatChordName(updatedItem, { style: 'short' });
                view.dispatch({ changes: { from: chordNode.from, to: chordNode.to, insert: formatted } });
              },
              onDelete: () => {
                view.dispatch({ changes: { from: chordNode.from, to: chordNode.to, insert: '' } });
              }
            });
          }
        }, 700);
      }
    },

    dblclick(event, view) {
      const cb = cbRef.current;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;

      const tree = syntaxTree(view.state);
      const chordNode = findChordAtPosition(tree, pos, view.state.doc.length, true);

      if (chordNode) {
        const transposedChordText = view.state.sliceDoc(chordNode.from, chordNode.to);
        const parsedChord = parseChordString(transposedChordText);

        if (parsedChord) {
          const coords = view.coordsAtPos(chordNode.from);
          const popoverPos = coords
            ? { x: coords.left, y: coords.bottom + 4 }
            : { x: event.clientX, y: event.clientY + 20 };

          cb.onReharmonizeClick(parsedChord, (newChord) => {
            const formatted = formatChordName(newChord, { style: 'short' });
            view.dispatch({ changes: { from: chordNode.from, to: chordNode.to, insert: formatted } });
          }, popoverPos);
        }
      } else {
        const line = view.state.doc.lineAt(pos);
        const lineIndex = line.number - 1;
        const charIndex = pos - line.from;

        const lineChords: SequenceItem[] = [];
        syntaxTree(view.state).iterate({
          from: line.from,
          to: line.to,
          enter: (node) => {
            if (node.type.name === 'chord') {
              const chordText = view.state.sliceDoc(node.from, node.to);
              const parsed = parseChordString(chordText);
              if (parsed) {
                lineChords.push({ ...parsed, id: Date.now(), raw: chordText, position: node.from - line.from });
              }
            }
          }
        });

        const prevChord = lineChords.filter(c => c.position! < charIndex).pop() || null;
        const nextChord = lineChords.find(c => c.position! >= charIndex) || null;

        if (prevChord && nextChord) {
          cb.onReharmonizeSpaceClick(lineIndex, charIndex, prevChord, nextChord, { x: event.clientX, y: event.clientY + 20 });
          return true;
        }
      }
      return true;
    },

    mouseleave(_event, _view) {
      clearLongPressTimeout();
      cbRef.current.onChordHover(null);
    }
  });
};

const cursorChordDetector = (cbRef: React.MutableRefObject<PluginCallbacks>) => {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!update.selectionSet) return;
    const pos = update.state.selection.main.head;
    const tree = syntaxTree(update.state);
    const chordNode = findChordAtPosition(tree, pos, update.state.doc.length);

    if (chordNode) {
      const chordText = update.state.sliceDoc(chordNode.from, chordNode.to);
      cbRef.current.onChordHover(parseChordString(chordText));
    } else {
      cbRef.current.onChordHover(null);
    }
  });
};

interface SongEditorProps {
  initialDoc: string;
  audioEngine: AudioEngine;
  showInspector: ShowInspectorFn;
  onChordHover: (chord: SequenceItem | null) => void;
  transpositionOffset: number;
  onDocChange: (doc: string) => void;
  onReharmonizeClick: (chord: SequenceItem, callback: (newChord: SequenceItem) => void, position: { x: number; y: number }) => void;
  onReharmonizeSpaceClick: (lineIndex: number, charIndex: number, prevChord: SequenceItem | null, nextChord: SequenceItem | null, position: { x: number; y: number }) => void;
}

const SongEditor: React.FC<SongEditorProps> = ({ initialDoc, audioEngine, showInspector, onChordHover, transpositionOffset, onDocChange, onReharmonizeClick, onReharmonizeSpaceClick }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const initializedRef = useRef<boolean>(false);
  const isProgrammaticChangeRef = useRef(false);

  // Ref que siempre tiene los callbacks más recientes — actualizado en cada render
  const cbRef = useRef<PluginCallbacks>({ audioEngine, showInspector, onChordHover, transpositionOffset, onDocChange, onReharmonizeClick, onReharmonizeSpaceClick });
  cbRef.current = { audioEngine, showInspector, onChordHover, transpositionOffset, onDocChange, onReharmonizeClick, onReharmonizeSpaceClick };

  const [untransposedDoc, setUntransposedDoc] = useState(initialDoc);

  const clearLongPressTimeout = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  // Inicialización del editor — se ejecuta una sola vez
  useEffect(() => {
    if (editorRef.current && !viewRef.current && !initializedRef.current) {
      const startState = EditorState.create({
        doc: initialDoc,
        extensions: [
          chordLanguage,
          syntaxHighlighting(chordHighlightStyle),
          editorTheme,
          chordInteractionPlugin(cbRef, longPressTimeoutRef, clearLongPressTimeout),
          cursorChordDetector(cbRef),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isProgrammaticChangeRef.current) {
              const newDoc = update.state.doc.toString();
              setUntransposedDoc(newDoc);
              cbRef.current.onDocChange(newDoc);
            }
          }),
        ],
      });

      viewRef.current = new EditorView({ state: startState, parent: editorRef.current });
      initializedRef.current = true;
    }

    return () => {
      if (!editorRef.current) {
        viewRef.current?.destroy();
        viewRef.current = null;
        initializedRef.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincroniza la vista con el doc transpuesto cuando cambia el offset
  useEffect(() => {
    if (!viewRef.current || !initializedRef.current) return;

    const newDisplayedDoc = untransposedDoc.split('\n').map(line => {
      if (chordLineRegex.test(line)) {
        return line.replace(/\S+/g, (chordText) => {
          const parsed = parseChordString(chordText);
          return parsed ? formatChordName(parsed, { style: 'short' }, transpositionOffset) : chordText;
        });
      }
      return line;
    }).join('\n');

    if (viewRef.current.state.doc.toString() !== newDisplayedDoc) {
      isProgrammaticChangeRef.current = true;
      viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: newDisplayedDoc } });
      isProgrammaticChangeRef.current = false;
    }
  }, [transpositionOffset, untransposedDoc]);

  // Sincroniza cuando el doc cambia externamente (importación)
  useEffect(() => {
    if (!viewRef.current || !initializedRef.current) return;
    const currentEditorDoc = viewRef.current.state.doc.toString();
    if (initialDoc !== currentEditorDoc && untransposedDoc !== initialDoc) {
      isProgrammaticChangeRef.current = true;
      viewRef.current.dispatch({ changes: { from: 0, to: currentEditorDoc.length, insert: initialDoc } });
      isProgrammaticChangeRef.current = false;
      setUntransposedDoc(initialDoc);
    }
  }, [initialDoc, untransposedDoc]);

  // Cancela long-press si el botón se suelta fuera del editor
  useEffect(() => {
    window.addEventListener('mouseup', clearLongPressTimeout);
    return () => window.removeEventListener('mouseup', clearLongPressTimeout);
  }, [clearLongPressTimeout]);

  return <div ref={editorRef} style={{ minHeight: '400px' }} />;
};

export default SongEditor;
