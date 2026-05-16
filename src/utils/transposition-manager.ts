// src/core/transposition-manager.ts

/**
 * Gestiona el estado y la lógica de la transposición de una canción.
 * Se encarga de subir/bajar semitonos y de actualizar la interfaz de usuario.
 */
export class TranspositionManager {
    private offset = 0;
    private displayElement: HTMLElement;
    private onTransposeCallback: () => void;

    constructor(displayElement: HTMLElement, onTransposeCallback: () => void) {
        this.displayElement = displayElement;
        this.onTransposeCallback = onTransposeCallback;
        this.updateDisplay();
    }

    /** Sube la transposición en un semitono. */
    public up(): void {
        if (this.offset < 12) {
            this.offset++;
            this.onTransposeCallback();
            this.updateDisplay();
        }
    }

    /** Baja la transposición en un semitono. */
    public down(): void {
        if (this.offset > -12) {
            this.offset--;
            this.onTransposeCallback();
            this.updateDisplay();
        }
    }

    /** Devuelve el valor actual de la transposición. */
    public getOffset(): number {
        return this.offset;
    }

    /** Resetea la transposición a su estado original (0). */
    public reset(): void {
        if (this.offset !== 0) {
            this.offset = 0;
            this.onTransposeCallback();
            this.updateDisplay();
        }
    }

    /** Actualiza el texto en el elemento HTML del display. */
    private updateDisplay(): void {
        let text = 'Original';
        if (this.offset > 0) {
            text = `+${this.offset}`;
        } else if (this.offset < 0) {
            text = `${this.offset}`;
        }
        this.displayElement.textContent = text;
    }
}
