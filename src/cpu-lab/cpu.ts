import { Memory } from "./memory";
import { Register } from "./registers";
import { Decoder } from "./decoder";
import type { DecodedInstruction, Operation } from "./decoder";
import { ALU } from "./alu";
import { ControlUnit, type Flags } from "./controlunit";

export type CpuStage = "IDLE" | "FETCH" | "DECODE" | "EXECUTE" | "HALTED";

export type CpuBlockId =
    | "pc"
    | "fetch"
    | "instructionQueue"
    | "decoder"
    | "mux"
    | "control"
    | "alu"
    | "memory"
    | "registers"
    | "result"
    | "flags"
    | "controlFlow";

export type CpuTraceId =
    | "pc-fetch"
    | "queue-decoder"
    | "decoder-control"
    | "control-mux"
    | "mux-alu"
    | "control-registers"
    | "control-memory"
    | "alu-result"
    | "alu-flags"
    | "result-registers"
    | "control-pc";

export interface CpuStageFlags {
    idle: boolean;
    fetch: boolean;
    decode: boolean;
    execute: boolean;
    halted: boolean;
}

export interface CpuControlSignals {
    clockHigh: boolean;
    fetchEnable: boolean;
    decodeEnable: boolean;
    executeEnable: boolean;
    pcRead: boolean;
    pcWrite: boolean;
    instructionRead: boolean;
    instructionWrite: boolean;
    registerRead: boolean;
    registerWrite: boolean;
    memoryRead: boolean;
    memoryWrite: boolean;
    aluEnable: boolean;
    flagsRead: boolean;
    flagsWrite: boolean;
    muxEnable: boolean;
    resultWrite: boolean;
    branchEvaluate: boolean;
    branchTaken: boolean;
    halt: boolean;
}

export interface CpuBlockState {
    id: CpuBlockId;
    label: string;
    active: boolean;
    read: boolean;
    write: boolean;
    value: string;
    detail: string;
    activatedBy: string;
}

export interface CpuTraceState {
    id: CpuTraceId;
    active: boolean;
    value: string;
}

export interface CpuRegisterState {
    index: number;
    name: string;
    value: string;
    previousValue: string;
    active: boolean;
    read: boolean;
    write: boolean;
    selected: boolean;
}

export interface CpuMemoryCellState {
    address: number;
    value: string;
    previousValue: string;
    active: boolean;
    read: boolean;
    write: boolean;
    addressed: boolean;
}

export interface CpuMuxState {
    active: boolean;
    select: "NONE" | "REGISTER" | "MEMORY" | "IMMEDIATE" | "PC";
    inputA: string;
    inputB: string;
    output: string;
}

export interface CpuAluState {
    active: boolean;
    operation: Operation | "NONE";
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
    result: string;
}

export interface CpuInstructionState {
    raw: string | null;
    decoded: DecodedInstruction | null;
    opcode: Operation | "NONE";
    destinationRegister: number | null;
    sourceRegister: number | null;
    address: number | null;
    text: string;
}

export interface CpuProgramLineState {
    index: number;
    text: string;
    current: boolean;
    fetched: boolean;
    decoded: boolean;
    executed: boolean;
}

export interface CpuCycleReport {
    tick: number;
    instructionCount: number;
    stage: CpuStage;
    action: string;
    pcBefore: number;
    pcAfter: number;
    rawInstruction: string | null;
    registerBefore: string[];
    registerAfter: string[];
    memoryBefore: string[];
    memoryAfter: string[];
    flagsBefore: Flags;
    flagsAfter: Flags;
    registerReads: number[];
    registerWrites: number[];
    memoryReadAddress: number | null;
    memoryWriteAddress: number | null;
    jumpTarget: number | null;
    branchTaken: boolean;
    resultText: string;
}

export interface CpuGlobalState {
    meta: {
        stage: CpuStage;
        stageFlags: CpuStageFlags;
        running: boolean;
        halted: boolean;
        clockSpeedMs: number;
        tick: number;
        instructionCount: number;
        statusText: string;
    };
    program: {
        pc: number;
        nextPc: number;
        size: number;
        lines: CpuProgramLineState[];
    };
    instruction: CpuInstructionState;
    registers: CpuRegisterState[];
    memory: CpuMemoryCellState[];
    flags: Flags & {
        active: boolean;
        read: boolean;
        write: boolean;
        text: string;
    };
    signals: CpuControlSignals;
    datapath: {
        blocks: Record<CpuBlockId, CpuBlockState>;
        traces: Record<CpuTraceId, CpuTraceState>;
        mux: CpuMuxState;
        alu: CpuAluState;
    };
    cycle: CpuCycleReport;
}

export type CpuSnapshot = CpuGlobalState;
export type CpuListener = (state: CpuGlobalState) => void;

interface InstructionUsage {
    registerReads: number[];
    registerWrites: number[];
    memoryReadAddress: number | null;
    memoryWriteAddress: number | null;
    aluOperation: Operation | "NONE";
    flagsRead: boolean;
    flagsWrite: boolean;
    muxSelect: CpuMuxState["select"];
    halt: boolean;
    resultWrite: boolean;
    branchEvaluate: boolean;
}

type MutableBlockMap = Record<CpuBlockId, CpuBlockState>;
type MutableTraceMap = Record<CpuTraceId, CpuTraceState>;

const BLOCK_LABELS: Record<CpuBlockId, string> = {
    pc: "PC",
    fetch: "FETCH",
    instructionQueue: "INSTRUCTION QUEUE",
    decoder: "DECODE",
    mux: "MUX",
    control: "CONTROL UNIT",
    alu: "ALU",
    memory: "MEMORY",
    registers: "REGISTER FILE",
    result: "RESULT",
    flags: "FLAGS",
    controlFlow: "CONTROL FLOW",
};

const TRACE_IDS: CpuTraceId[] = [
    "pc-fetch",
    "queue-decoder",
    "decoder-control",
    "control-mux",
    "mux-alu",
    "control-registers",
    "control-memory",
    "alu-result",
    "alu-flags",
    "result-registers",
    "control-pc",
];

const EMPTY_FLAGS: Flags = { equal: false, greater: false, less: false };

export let globalCpuState: CpuGlobalState | null = null;

export class CPU {
    private registers: Register[];
    private memory: Memory;
    private decoder: Decoder;
    private controlUnit: ControlUnit;
    private alu: ALU;

    private program: string[] = [];
    private pc = 0;
    private nextPc = 0;
    private stage: CpuStage = "IDLE";
    private halted = false;
    private tick = 0;
    private instructionCount = 0;

    private currentRaw: string | null = null;
    private currentDecoded: DecodedInstruction | null = null;
    private flags: Flags = { ...EMPTY_FLAGS };
    private lastCycle: CpuCycleReport;

    private clockSpeedMs = 1000;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    private listeners: CpuListener[] = [];

    constructor(totalRegisters: number, memorySize: number) {
        this.registers = Array.from({ length: totalRegisters }, () => new Register("0"));
        this.memory = new Memory(memorySize);
        this.decoder = new Decoder(memorySize, totalRegisters);
        this.controlUnit = new ControlUnit();
        this.alu = new ALU();
        this.lastCycle = this.createEmptyCycleReport("CPU created");
    }

    public loadProgram(instructions: string[]): void {
        this.pause();
        this.program = [...instructions];
        this.pc = 0;
        this.nextPc = 0;
        this.halted = false;
        this.stage = "IDLE";
        this.tick = 0;
        this.instructionCount = 0;
        this.currentRaw = null;
        this.currentDecoded = null;
        this.flags = { ...EMPTY_FLAGS };
        this.lastCycle = this.createEmptyCycleReport("Program loaded");
        this.emit();
    }

    public loadMemory(values: string[]): void {
        const size = this.memoryValues().length;
        values.forEach((value, address) => {
            if (address < size) {
                this.memory.setMemoryAtLoc(new Register(address.toString()), value);
            }
        });
        this.lastCycle = this.createEmptyCycleReport("Memory loaded");
        this.emit();
    }

    public reset(): void {
        this.loadProgram(this.program);
    }

    public onChange(listener: CpuListener): () => void {
        this.listeners.push(listener);
        listener(this.getState());
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    public getState(): CpuGlobalState {
        const usage = this.describeUsage(this.currentDecoded);
        const registerValues = this.registerValues();
        const memoryValues = this.memoryValues();
        const stageFlags = this.getStageFlags();
        const signals = this.buildSignals(stageFlags, usage);
        const mux = this.buildMuxState(usage, registerValues, memoryValues);
        const alu = this.buildAluState(usage, registerValues, memoryValues);
        const registers = this.buildRegisterStates(registerValues, usage);
        const memory = this.buildMemoryStates(memoryValues, usage);
        const blocks = this.buildBlocks(stageFlags, signals, mux, alu, registers, memory);
        const traces = this.buildTraces(signals, mux, alu);
        const flags = {
            ...this.flags,
            active: blocks.flags.active,
            read: signals.flagsRead,
            write: signals.flagsWrite,
            text: this.formatFlags(this.flags),
        };

        return {
            meta: {
                stage: this.stage,
                stageFlags,
                running: this.running,
                halted: this.halted,
                clockSpeedMs: this.clockSpeedMs,
                tick: this.tick,
                instructionCount: this.instructionCount,
                statusText: this.getStatusText(),
            },
            program: {
                pc: this.pc,
                nextPc: this.nextPc,
                size: this.program.length,
                lines: this.buildProgramLines(),
            },
            instruction: this.buildInstructionState(),
            registers,
            memory,
            flags,
            signals,
            datapath: { blocks, traces, mux, alu },
            cycle: this.lastCycle,
        };
    }

    public getSnapshot(): CpuSnapshot {
        return this.getState();
    }

    public setClockSpeed(ms: number): void {
        if (!Number.isFinite(ms) || ms <= 0) {
            throw new Error("Clock speed must be a positive number of ms");
        }
        this.clockSpeedMs = ms;
        if (this.running) {
            this.pause();
            this.run();
        } else {
            this.emit();
        }
    }

    public run(): void {
        if (this.running || this.halted) return;
        this.running = true;
        this.emit();
        this.timer = setInterval(() => {
            try {
                this.stepStage();
            } catch (err) {
                this.pause();
                throw err;
            }
            if (this.halted) this.pause();
        }, this.clockSpeedMs);
    }

    public pause(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        const wasRunning = this.running;
        this.running = false;
        if (wasRunning) this.emit();
    }

    public isRunning(): boolean {
        return this.running;
    }

    public isHalted(): boolean {
        return this.halted;
    }

    public step(): void {
        if (this.halted) return;
        this.stepStage();
        if (!this.halted) this.stepStage();
        if (!this.halted) this.stepStage();
    }

    public stepStage(): void {
        if (this.halted) return;

        switch (this.stage) {
            case "IDLE":
                this.fetch();
                break;

            case "FETCH":
                this.decode();
                break;

            case "DECODE":
                this.executeInstr();
                break;

            case "EXECUTE":
                this.fetch();
                break;

            case "HALTED":
                return;
        }

        this.tick++;
        this.emit();
    }

    private emit(): void {
        const state = this.getState();
        globalCpuState = state;
        for (const listener of this.listeners) listener(state);
    }

    private fetch(): void {
        const before = this.createEmptyCycleReport("Fetch");
        before.pcBefore = this.pc;

        if (this.pc >= this.program.length) {
            this.halted = true;
            this.stage = "HALTED";
            this.currentRaw = null;
            this.currentDecoded = null;
            this.nextPc = this.pc;
            this.lastCycle = {
                ...before,
                stage: "HALTED",
                action: "Program counter reached the end of the loaded program",
                pcAfter: this.pc,
                resultText: "HALTED",
            };
            return;
        }

        this.currentRaw = this.program[this.pc];
        this.currentDecoded = null;
        this.nextPc = this.pc;
        this.stage = "FETCH";
        this.lastCycle = {
            ...before,
            stage: "FETCH",
            action: "Instruction fetched from program memory into IR",
            pcAfter: this.pc,
            rawInstruction: this.currentRaw,
            resultText: this.currentRaw,
        };
    }

    private decode(): void {
        const before = this.createEmptyCycleReport("Decode");
        before.pcBefore = this.pc;
        before.rawInstruction = this.currentRaw;

        if (this.currentRaw === null) return;

        this.currentDecoded = this.decoder.decode(this.currentRaw);
        this.stage = "DECODE";
        this.lastCycle = {
            ...before,
            stage: "DECODE",
            action: `Decoded ${this.currentDecoded.operation}`,
            pcAfter: this.pc,
            resultText: this.formatDecoded(this.currentDecoded),
        };
    }

    private executeInstr(): void {
        if (this.currentDecoded === null) return;

        const instruction = this.currentDecoded;
        const usage = this.describeUsage(instruction);
        const registerBefore = this.registerValues();
        const memoryBefore = this.memoryValues();
        const flagsBefore = { ...this.flags };
        const pcBefore = this.pc;

        if (instruction.operation === "HALT") {
            this.halted = true;
            this.stage = "HALTED";
            this.nextPc = this.pc;
            this.instructionCount++;
            this.lastCycle = {
                tick: this.tick + 1,
                instructionCount: this.instructionCount,
                stage: "HALTED",
                action: "HALT executed",
                pcBefore,
                pcAfter: this.pc,
                rawInstruction: this.currentRaw,
                registerBefore,
                registerAfter: this.registerValues(),
                memoryBefore,
                memoryAfter: this.memoryValues(),
                flagsBefore,
                flagsAfter: { ...this.flags },
                registerReads: usage.registerReads,
                registerWrites: usage.registerWrites,
                memoryReadAddress: usage.memoryReadAddress,
                memoryWriteAddress: usage.memoryWriteAddress,
                jumpTarget: null,
                branchTaken: false,
                resultText: "HALTED",
            };
            return;
        }

        const result = this.controlUnit.execute(instruction, this.registers, this.alu, this.memory, this.flags);

        if (result.updatedFlags) {
            this.flags = result.updatedFlags;
        }

        const jumpTarget = result.jumpTo ?? null;
        const pcAfter = jumpTarget ?? this.pc + 1;
        this.nextPc = pcAfter;
        this.pc = pcAfter;
        this.stage = result.halted ? "HALTED" : "EXECUTE";
        this.halted = Boolean(result.halted);
        this.instructionCount++;

        const registerAfter = this.registerValues();
        const memoryAfter = this.memoryValues();
        const flagsAfter = { ...this.flags };

        this.lastCycle = {
            tick: this.tick + 1,
            instructionCount: this.instructionCount,
            stage: this.stage,
            action: this.describeAction(instruction, usage, jumpTarget),
            pcBefore,
            pcAfter,
            rawInstruction: this.currentRaw,
            registerBefore,
            registerAfter,
            memoryBefore,
            memoryAfter,
            flagsBefore,
            flagsAfter,
            registerReads: usage.registerReads,
            registerWrites: usage.registerWrites,
            memoryReadAddress: usage.memoryReadAddress,
            memoryWriteAddress: usage.memoryWriteAddress,
            jumpTarget,
            branchTaken: jumpTarget !== null,
            resultText: this.describeResult(instruction, usage, registerAfter, memoryAfter, flagsAfter, jumpTarget),
        };
    }

    private createEmptyCycleReport(action: string): CpuCycleReport {
        const registerValues = this.registerValues();
        const memoryValues = this.memoryValues();
        return {
            tick: this.tick,
            instructionCount: this.instructionCount,
            stage: this.stage,
            action,
            pcBefore: this.pc,
            pcAfter: this.pc,
            rawInstruction: this.currentRaw,
            registerBefore: registerValues,
            registerAfter: registerValues,
            memoryBefore: memoryValues,
            memoryAfter: memoryValues,
            flagsBefore: { ...this.flags },
            flagsAfter: { ...this.flags },
            registerReads: [],
            registerWrites: [],
            memoryReadAddress: null,
            memoryWriteAddress: null,
            jumpTarget: null,
            branchTaken: false,
            resultText: "",
        };
    }

    private describeUsage(instruction: DecodedInstruction | null): InstructionUsage {
        if (instruction === null) {
            return {
                registerReads: [],
                registerWrites: [],
                memoryReadAddress: null,
                memoryWriteAddress: null,
                aluOperation: "NONE",
                flagsRead: false,
                flagsWrite: false,
                muxSelect: "NONE",
                halt: false,
                resultWrite: false,
                branchEvaluate: false,
            };
        }

        switch (instruction.operation) {
            case "ADD":
            case "SUB":
            case "MUL":
            case "DIV":
                return {
                    registerReads: this.uniqueNumbers([instruction.destination, instruction.source]),
                    registerWrites: this.uniqueNumbers([instruction.destination]),
                    memoryReadAddress: null,
                    memoryWriteAddress: null,
                    aluOperation: instruction.operation,
                    flagsRead: false,
                    flagsWrite: false,
                    muxSelect: "REGISTER",
                    halt: false,
                    resultWrite: true,
                    branchEvaluate: false,
                };
            case "LOAD":
                return {
                    registerReads: [],
                    registerWrites: this.uniqueNumbers([instruction.destination]),
                    memoryReadAddress: instruction.address ?? null,
                    memoryWriteAddress: null,
                    aluOperation: "NONE",
                    flagsRead: false,
                    flagsWrite: false,
                    muxSelect: "MEMORY",
                    halt: false,
                    resultWrite: true,
                    branchEvaluate: false,
                };
            case "STORE":
                return {
                    registerReads: this.uniqueNumbers([instruction.source]),
                    registerWrites: [],
                    memoryReadAddress: null,
                    memoryWriteAddress: instruction.address ?? null,
                    aluOperation: "NONE",
                    flagsRead: false,
                    flagsWrite: false,
                    muxSelect: "MEMORY",
                    halt: false,
                    resultWrite: false,
                    branchEvaluate: false,
                };
            case "CMP":
                return {
                    registerReads: this.uniqueNumbers([instruction.source]),
                    registerWrites: [],
                    memoryReadAddress: instruction.address ?? null,
                    memoryWriteAddress: null,
                    aluOperation: "CMP",
                    flagsRead: false,
                    flagsWrite: true,
                    muxSelect: "MEMORY",
                    halt: false,
                    resultWrite: false,
                    branchEvaluate: false,
                };
            case "JMPE":
            case "JMPG":
            case "JMPL":
                return {
                    registerReads: [],
                    registerWrites: [],
                    memoryReadAddress: null,
                    memoryWriteAddress: null,
                    aluOperation: "NONE",
                    flagsRead: true,
                    flagsWrite: false,
                    muxSelect: "PC",
                    halt: false,
                    resultWrite: false,
                    branchEvaluate: true,
                };
            case "HALT":
                return {
                    registerReads: [],
                    registerWrites: [],
                    memoryReadAddress: null,
                    memoryWriteAddress: null,
                    aluOperation: "NONE",
                    flagsRead: false,
                    flagsWrite: false,
                    muxSelect: "NONE",
                    halt: true,
                    resultWrite: false,
                    branchEvaluate: false,
                };
        }
    }

    private buildSignals(stageFlags: CpuStageFlags, usage: InstructionUsage): CpuControlSignals {
        const executing = stageFlags.execute;
        const branchTaken = executing && this.lastCycle.branchTaken;
        return {
            clockHigh: this.running,
            fetchEnable: stageFlags.fetch,
            decodeEnable: stageFlags.decode,
            executeEnable: executing,
            pcRead: stageFlags.fetch,
            pcWrite: executing && (usage.branchEvaluate || !usage.halt),
            instructionRead: stageFlags.fetch,
            instructionWrite: stageFlags.fetch,
            registerRead: executing && usage.registerReads.length > 0,
            registerWrite: executing && usage.registerWrites.length > 0,
            memoryRead: executing && usage.memoryReadAddress !== null,
            memoryWrite: executing && usage.memoryWriteAddress !== null,
            aluEnable: executing && usage.aluOperation !== "NONE",
            flagsRead: executing && usage.flagsRead,
            flagsWrite: executing && usage.flagsWrite,
            muxEnable: executing && usage.muxSelect !== "NONE",
            resultWrite: executing && usage.resultWrite,
            branchEvaluate: executing && usage.branchEvaluate,
            branchTaken,
            halt: stageFlags.halted || (executing && usage.halt),
        };
    }

    private buildMuxState(
        usage: InstructionUsage,
        registerValues: string[],
        memoryValues: string[]
    ): CpuMuxState {
        const active = this.stage === "EXECUTE" && usage.muxSelect !== "NONE";
        const instruction = this.currentDecoded;
        const inputA = instruction?.destination !== undefined ? `R${instruction.destination}` : "PC";
        let inputB = "none";

        if (instruction?.source !== undefined) {
            inputB = `R${instruction.source}`;
        } else if (instruction?.address !== undefined) {
            inputB = `addr ${instruction.address}`;
        }

        let output = "idle";
        if (active && instruction) {
            if (usage.muxSelect === "REGISTER" && instruction.source !== undefined) {
                output = registerValues[instruction.source] ?? "0";
            } else if (usage.muxSelect === "MEMORY" && instruction.address !== undefined) {
                output = memoryValues[instruction.address] ?? "0";
            } else if (usage.muxSelect === "PC" && instruction.address !== undefined) {
                output = String(instruction.address);
            }
        }

        return {
            active,
            select: active ? usage.muxSelect : "NONE",
            inputA,
            inputB,
            output,
        };
    }

    private buildAluState(
        usage: InstructionUsage,
        registerValues: string[],
        memoryValues: string[]
    ): CpuAluState {
        const instruction = this.currentDecoded;
        const active = this.stage === "EXECUTE" && usage.aluOperation !== "NONE" && instruction !== null;
        const empty = {
            active: false,
            operation: "NONE" as const,
            leftLabel: "A",
            leftValue: "0",
            rightLabel: "B",
            rightValue: "0",
            result: "idle",
        };

        if (!active || instruction === null) return empty;

        if (instruction.operation === "CMP") {
            const source = instruction.source ?? 0;
            const address = instruction.address ?? 0;
            return {
                active,
                operation: "CMP",
                leftLabel: `R${source}`,
                leftValue: registerValues[source] ?? "0",
                rightLabel: `M${address}`,
                rightValue: memoryValues[address] ?? "0",
                result: this.formatFlags(this.flags),
            };
        }

        const destination = instruction.destination ?? 0;
        const source = instruction.source ?? 0;
        return {
            active,
            operation: instruction.operation,
            leftLabel: `R${destination}`,
            leftValue: this.lastCycle.registerBefore[destination] ?? registerValues[destination] ?? "0",
            rightLabel: `R${source}`,
            rightValue: this.lastCycle.registerBefore[source] ?? registerValues[source] ?? "0",
            result: registerValues[destination] ?? "0",
        };
    }

    private buildRegisterStates(registerValues: string[], usage: InstructionUsage): CpuRegisterState[] {
        return registerValues.map((value, index) => {
            const read = this.stage === "EXECUTE" && usage.registerReads.includes(index);
            const write = this.stage === "EXECUTE" && usage.registerWrites.includes(index);
            return {
                index,
                name: `R${index}`,
                value,
                previousValue: this.lastCycle.registerBefore[index] ?? value,
                active: read || write,
                read,
                write,
                selected: read || write,
            };
        });
    }

    private buildMemoryStates(memoryValues: string[], usage: InstructionUsage): CpuMemoryCellState[] {
        return memoryValues.map((value, address) => {
            const read = this.stage === "EXECUTE" && usage.memoryReadAddress === address;
            const write = this.stage === "EXECUTE" && usage.memoryWriteAddress === address;
            return {
                address,
                value,
                previousValue: this.lastCycle.memoryBefore[address] ?? value,
                active: read || write,
                read,
                write,
                addressed: read || write,
            };
        });
    }

    private buildBlocks(
        stageFlags: CpuStageFlags,
        signals: CpuControlSignals,
        mux: CpuMuxState,
        alu: CpuAluState,
        registers: CpuRegisterState[],
        memory: CpuMemoryCellState[]
    ): MutableBlockMap {
        const blocks = Object.fromEntries(
            Object.entries(BLOCK_LABELS).map(([id, label]) => [
                id,
                {
                    id: id as CpuBlockId,
                    label,
                    active: false,
                    read: false,
                    write: false,
                    value: "idle",
                    detail: "",
                    activatedBy: "",
                },
            ])
        ) as MutableBlockMap;

        this.activateBlock(blocks.pc, stageFlags.fetch || signals.pcWrite, signals.pcRead, signals.pcWrite, String(this.pc), "program counter");
        this.activateBlock(blocks.fetch, stageFlags.fetch, signals.instructionRead, signals.instructionWrite, this.currentRaw ?? "idle", "loads IR");
        this.activateBlock(blocks.instructionQueue, stageFlags.fetch || stageFlags.decode, stageFlags.fetch, false, `${this.program.length} lines`, "program window");
        this.activateBlock(blocks.decoder, stageFlags.decode || stageFlags.execute, stageFlags.decode, false, this.currentDecoded?.operation ?? "idle", "decoded instruction");
        this.activateBlock(blocks.mux, mux.active, mux.active, false, mux.select, `${mux.inputA} / ${mux.inputB} -> ${mux.output}`);
        this.activateBlock(blocks.control, stageFlags.decode || stageFlags.execute || stageFlags.halted, stageFlags.decode, stageFlags.execute, this.currentDecoded?.operation ?? this.stage, "control signals");
        this.activateBlock(blocks.alu, alu.active, alu.active, alu.active, alu.operation, `${alu.leftLabel} ${alu.operation} ${alu.rightLabel}`);
        this.activateBlock(blocks.memory, memory.some((cell) => cell.active), signals.memoryRead, signals.memoryWrite, this.formatMemoryActivity(memory), "data memory");
        this.activateBlock(blocks.registers, registers.some((reg) => reg.active), signals.registerRead, signals.registerWrite, this.formatRegisterActivity(registers), "register file");
        this.activateBlock(blocks.result, signals.resultWrite, false, signals.resultWrite, this.lastCycle.resultText || "idle", "write-back value");
        this.activateBlock(blocks.flags, signals.flagsRead || signals.flagsWrite, signals.flagsRead, signals.flagsWrite, this.formatFlags(this.flags), "condition flags");
        this.activateBlock(blocks.controlFlow, signals.branchEvaluate || signals.halt || stageFlags.halted, signals.flagsRead, signals.pcWrite, signals.halt ? "HALT" : signals.branchTaken ? "JUMP" : "NEXT", "next PC");

        return blocks;
    }

    private buildTraces(signals: CpuControlSignals, mux: CpuMuxState, alu: CpuAluState): MutableTraceMap {
        const traces = Object.fromEntries(
            TRACE_IDS.map((id) => [id, { id, active: false, value: "" }])
        ) as MutableTraceMap;

        this.activateTrace(traces["pc-fetch"], signals.fetchEnable, String(this.pc));
        this.activateTrace(traces["queue-decoder"], signals.decodeEnable, this.currentRaw ?? "");
        this.activateTrace(traces["decoder-control"], signals.decodeEnable || signals.executeEnable, this.currentDecoded?.operation ?? "");
        this.activateTrace(traces["control-mux"], mux.active, mux.select);
        this.activateTrace(traces["mux-alu"], alu.active, mux.output);
        this.activateTrace(traces["control-registers"], signals.registerRead || signals.registerWrite, this.formatRegisterActivity(this.buildRegisterStates(this.registerValues(), this.describeUsage(this.currentDecoded))));
        this.activateTrace(traces["control-memory"], signals.memoryRead || signals.memoryWrite, this.formatMemoryAddress());
        this.activateTrace(traces["alu-result"], signals.resultWrite, alu.result);
        this.activateTrace(traces["alu-flags"], signals.flagsWrite, this.formatFlags(this.flags));
        this.activateTrace(traces["result-registers"], signals.registerWrite, this.lastCycle.resultText);
        this.activateTrace(traces["control-pc"], signals.pcWrite, String(this.nextPc));

        return traces;
    }

    private buildProgramLines(): CpuProgramLineState[] {
        return this.program.map((text, index) => ({
            index,
            text,
            current: index === this.pc,
            fetched: this.stage === "FETCH" && index === this.pc,
            decoded: this.stage === "DECODE" && index === this.pc,
            executed: this.lastCycle.pcBefore === index && (this.stage === "EXECUTE" || this.stage === "HALTED"),
        }));
    }

    private buildInstructionState(): CpuInstructionState {
        const decoded = this.currentDecoded;
        return {
            raw: this.currentRaw,
            decoded,
            opcode: decoded?.operation ?? "NONE",
            destinationRegister: decoded?.destination ?? null,
            sourceRegister: decoded?.source ?? null,
            address: decoded?.address ?? null,
            text: decoded ? this.formatDecoded(decoded) : this.currentRaw ?? "idle",
        };
    }

    private getStageFlags(): CpuStageFlags {
        return {
            idle: this.stage === "IDLE",
            fetch: this.stage === "FETCH",
            decode: this.stage === "DECODE",
            execute: this.stage === "EXECUTE",
            halted: this.stage === "HALTED",
        };
    }

    private getStatusText(): string {
        if (this.halted) return "HALTED";
        if (this.running) return "RUNNING";
        return this.stage === "IDLE" ? "READY" : "PAUSED";
    }

    private describeAction(
        instruction: DecodedInstruction,
        usage: InstructionUsage,
        jumpTarget: number | null
    ): string {
        if (usage.branchEvaluate) {
            return jumpTarget === null
                ? `${instruction.operation} checked flags, branch not taken`
                : `${instruction.operation} checked flags, jumped to ${jumpTarget}`;
        }
        if (usage.memoryReadAddress !== null) return `${instruction.operation} read memory[${usage.memoryReadAddress}]`;
        if (usage.memoryWriteAddress !== null) return `${instruction.operation} wrote memory[${usage.memoryWriteAddress}]`;
        if (usage.aluOperation !== "NONE") return `${instruction.operation} executed in ALU`;
        return `${instruction.operation} executed`;
    }

    private describeResult(
        instruction: DecodedInstruction,
        usage: InstructionUsage,
        registerAfter: string[],
        memoryAfter: string[],
        flagsAfter: Flags,
        jumpTarget: number | null
    ): string {
        if (instruction.operation === "CMP") return this.formatFlags(flagsAfter);
        if (usage.registerWrites.length > 0) {
            const register = usage.registerWrites[0];
            return `R${register} <- ${registerAfter[register] ?? "0"}`;
        }
        if (usage.memoryWriteAddress !== null) {
            return `M${usage.memoryWriteAddress} <- ${memoryAfter[usage.memoryWriteAddress] ?? "0"}`;
        }
        if (usage.branchEvaluate) {
            return jumpTarget === null ? `PC <- ${this.pc}` : `PC <- ${jumpTarget}`;
        }
        return instruction.operation;
    }

    private activateBlock(
        block: CpuBlockState,
        active: boolean,
        read: boolean,
        write: boolean,
        value: string,
        detail: string
    ): void {
        block.active = active;
        block.read = read;
        block.write = write;
        block.value = value;
        block.detail = detail;
        block.activatedBy = active ? this.stage : "";
    }

    private activateTrace(trace: CpuTraceState, active: boolean, value: string): void {
        trace.active = active;
        trace.value = value;
    }

    private registerValues(): string[] {
        return this.registers.map((r) => r.getValue());
    }

    private memoryValues(): string[] {
        return [...this.memory.snapshot()];
    }

    private uniqueNumbers(values: Array<number | undefined>): number[] {
        return [...new Set(values.filter((value): value is number => value !== undefined))];
    }

    private formatDecoded(d: DecodedInstruction): string {
        const parts: string[] = [d.operation];
        if (d.destination !== undefined) parts.push(`dest=R${d.destination}`);
        if (d.source !== undefined) parts.push(`src=R${d.source}`);
        if (d.address !== undefined) parts.push(`addr=${d.address}`);
        return parts.join(" ");
    }

    private formatFlags(flags: Flags): string {
        return `EQ ${flags.equal ? 1 : 0}  GT ${flags.greater ? 1 : 0}  LT ${flags.less ? 1 : 0}`;
    }

    private formatRegisterActivity(registers: CpuRegisterState[]): string {
        const active = registers.filter((reg) => reg.active).map((reg) => reg.name);
        return active.length > 0 ? active.join(", ") : `R0-R${registers.length - 1}`;
    }

    private formatMemoryActivity(memory: CpuMemoryCellState[]): string {
        const active = memory.find((cell) => cell.active);
        if (!active) return `${memory.length} cells`;
        return `M${active.address}=${active.value}`;
    }

    private formatMemoryAddress(): string {
        const address = this.lastCycle.memoryReadAddress ?? this.lastCycle.memoryWriteAddress;
        return address === null ? "" : `M${address}`;
    }
}
