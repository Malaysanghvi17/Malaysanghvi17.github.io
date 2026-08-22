import { ALU } from "./alu";
import { Memory } from "./memory";
import { Register } from "./registers";
import type { DecodedInstruction } from "./decoder";

export interface Flags {
    equal: boolean;
    greater: boolean;
    less: boolean;
}

export interface ExecutionResult {
    jumpTo?: number;
    halted?: boolean;
    updatedFlags?: Flags;
}

export class ControlUnit {
    public execute(
        instruction: DecodedInstruction,
        registers: Register[],
        alu: ALU,
        memory: Memory,
        flags: Flags
    ): ExecutionResult {
        switch (instruction.operation) {
            case "ADD": {
                const destination = registers[instruction.destination!];
                const source = registers[instruction.source!];
                destination.setValue(alu.add(destination, source).getValue());
                return {};
            }

            case "SUB": {
                const destination = registers[instruction.destination!];
                const source = registers[instruction.source!];
                destination.setValue(alu.sub(destination, source).getValue());
                return {};
            }

            case "MUL": {
                const destination = registers[instruction.destination!];
                const source = registers[instruction.source!];
                destination.setValue(alu.mul(destination, source).getValue());
                return {};
            }

            case "DIV": {
                const destination = registers[instruction.destination!];
                const source = registers[instruction.source!];
                destination.setValue(alu.div(destination, source).getValue());
                return {};
            }

            case "LOAD": {
                const destination = registers[instruction.destination!];
                const address = new Register((instruction.address!).toString());
                destination.setValue(memory.getMemoryAtLoc(address));
                return {};
            }

            case "STORE": {
                const address = new Register((instruction.address!).toString());
                const value = instruction.source !== undefined
                    ? registers[instruction.source].getValue()
                    : instruction.immediate!;
                memory.setMemoryAtLoc(address, value);
                return {};
            }

            case "CMP": {
                // compare register vs memory[address], set flags
                const source = registers[instruction.source!];
                const addrReg = new Register(instruction.address!.toString());
                const memVal = new Register(memory.getMemoryAtLoc(addrReg));
                const updatedFlags = alu.cmp(source, memVal, { ...flags });
                return { updatedFlags };
            }

            case "JMPE":
                return flags.equal ? { jumpTo: instruction.address! } : {};

            case "JMPG":
                return flags.greater ? { jumpTo: instruction.address! } : {};

            case "JMPL":
                return flags.less ? { jumpTo: instruction.address! } : {};

            case "HALT":
                return { halted: true };

            default:
                throw new Error(
                    `Unsupported operation: ${instruction.operation}`
                );
        }
    }
}
