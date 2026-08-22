import type { Register } from "./registers";

export class Memory {
    private memory: string[];
    private size: number;
    constructor(size: number) {
        this.size = size;
        this.memory = new Array(size).fill("0");
    }

    public getMemoryAtLoc(loc: Register): string {
        this.assertInBounds(Number(loc.getValue()));
        return this.memory[Number(loc.getValue())];
    }

    public setMemoryAtLoc(loc: Register, value: string): void {
        this.assertInBounds(Number(loc.getValue()));
        this.memory[Number(loc.getValue())] = value;
    }

    public snapshot(): readonly string[] {
        return this.memory;
    }

    private assertInBounds(address: number): void {
        if (!Number.isInteger(address) || address < 0 || address >= this.size) {
            throw new Error(`Memory address out of bounds: ${address}`);
        }
    }
}
