export type Operation =
    | "ADD"
    | "SUB"
    | "MUL"
    | "DIV"
    | "LOAD"
    | "STORE"
    | "CMP"
    | "JMPE"
    | "JMPG"
    | "JMPL"
    | "HALT";

export interface DecodedInstruction {
    operation: Operation;
    source?: number;
    destination?: number;
    address?: number;
    immediate?: string;
}

export class Decoder {
    private memorySize: number;
    private totalRegisters: number;
    constructor(memorySize: number, totalRegisters: number) {
        this.memorySize = memorySize;
        this.totalRegisters = totalRegisters;
    }

    public decode(instruction: string): DecodedInstruction {
        const parts = instruction
            .trim()
            .toLowerCase()
            .replace(/,/g, "")
            .split(/\s+/);

        const opcode = parts[0];

        switch (opcode) {
            case "add":
                return {
                    operation: "ADD",
                    destination: this.parseRegister(parts[1]),
                    source: this.parseRegister(parts[2])
                };

            case "sub":
                return {
                    operation: "SUB",
                    destination: this.parseRegister(parts[1]),
                    source: this.parseRegister(parts[2])
                };

            case "mul":
                return {
                    operation: "MUL",
                    destination: this.parseRegister(parts[1]),
                    source: this.parseRegister(parts[2])
                };

            case "div":
                return {
                    operation: "DIV",
                    destination: this.parseRegister(parts[1]),
                    source: this.parseRegister(parts[2])
                };

            case "load":
                return {
                    operation: "LOAD",
                    destination: this.parseRegister(parts[1]),
                    address: this.parseAddress(parts[2])
                };

            case "store": {
                const address = this.parseAddress(parts[2]);
                // Try register first; if it's not a valid rN token, treat it as an immediate literal
                if (/^r\d+$/i.test(parts[1] ?? "")) {
                    return {
                        operation: "STORE",
                        source: this.parseRegister(parts[1]),
                        address
                    };
                }
                let immediate = Number(parts[1]);
                if (!Number.isFinite(immediate)) {
                    throw new Error(`Invalid STORE operand: ${parts[1]}`);
                }
                return {
                    operation: "STORE",
                    immediate: immediate.toString(),
                    address
                };
            }
            case "cmp":
                // CMP reg, addr  — compare register vs memory[addr]
                return {
                    operation: "CMP",
                    source: this.parseRegister(parts[1]),
                    address: this.parseAddress(parts[2])
                };
            case "jmpe":
                return { operation: "JMPE", address: this.parseAddress(parts[1]) };
            case "jmpg":
                return { operation: "JMPG", address: this.parseAddress(parts[1]) };
            case "jmpl":
                return { operation: "JMPL", address: this.parseAddress(parts[1]) };

            case "halt":
                return { operation: "HALT" };

            default:
                throw new Error(`Unknown instruction: ${opcode}`);
        }
    }

    private parseRegister(register: string | undefined): number {
        const match = register?.match(/^r(\d+)$/i);

        if (!match) {
            throw new Error(`Invalid register: ${register ?? ""}`);
        }

        const regNumber = Number(match[1]);
        if (regNumber < 0 || regNumber >= this.totalRegisters) {
            throw new Error(`Invalid register: ${register}`);
        }
        return regNumber;
    }

    private parseAddress(address: string): number {
        const value = Number(address);
        if (!Number.isInteger(value) || value < 0 || value >= this.memorySize) {
            throw new Error(`Invalid memory address: ${address}`);
        }
        return value;
    }
}
