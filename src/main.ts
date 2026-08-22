import { CPU } from "./cpu-lab/cpu";

// ---------------------------------------------------------
// CPU Setup
// ---------------------------------------------------------

const cpu = new CPU(5, 32);

const DEFAULT_PROGRAM = `STORE 0, 0 ;fibonacci series
STORE 1, 1
STORE 10, 2
STORE 1, 3
STORE 0, 4
LOAD R0, 0
LOAD R1, 1
LOAD R2, 2
LOAD R3, 3
STORE R1, 6
CMP R2, 4
JMPG 13
HALT
STORE R1, 5
ADD R1, R0
LOAD R0, 5
STORE R1, 6
SUB R2, R3
CMP R2, 4
JMPG 13
HALT`;

const DEFAULT_MEMORY: string[] = Array(32).fill("0");

// ---------------------------------------------------------
// Execution State
// ---------------------------------------------------------

let running = false;
let timer: number | null = null;
let cycleSpeed = 1000;
let editMode = false;
let currentProgramText = DEFAULT_PROGRAM;

// ---------------------------------------------------------
// Architecture Config
// ---------------------------------------------------------

interface PortPos { side: "left" | "right" | "top" | "bottom"; }

interface BlockConfig {
    id: string;
    title: string;
    gridCol: string;
    gridRow: string;
    ports: PortPos[];
    template: string;
    render: (el: HTMLElement, state: any) => void;
    isActive: (state: any) => boolean;
}

interface WireConfig {
    id: string;
    fromBlock: string;
    fromPort: PortPos;
    toBlock: string;
    toPort: PortPos;
    routing?: "straight" | "curve" | "bottom-route" | "parallel";
    isActive: (state: any) => boolean;
    parallelIndex?: number;
    parallelTotal?: number;
    label?: string;
}

const ALU_OPERATIONS = ["ADD", "SUB", "MUL", "DIV", "CMP"];

// 4-column layout:
//   Row 1: FETCH | DECODE | MUX   | ALU
//   Row 2: MEMORY | CONTROL | REGISTERS | CONTROL-FLOW

const BLOCKS: BlockConfig[] = [
    // ---- ROW 1 ----
    {
        id: "fetch",
        title: "FETCH",
        gridCol: "1",
        gridRow: "1",
        ports: [{ side: "right" }, { side: "bottom" }],
        template: `
            <div class="block-body">
                <div class="register"><span>PC</span><strong class="js-pc">0x0000</strong></div>
                <div class="register"><span>IR</span><strong class="js-ir">idle</strong></div>
            </div>`,
        render: (el, state) => {
            el.querySelector(".js-pc")!.textContent = `0x${state.program.pc.toString(16).padStart(4, "0").toUpperCase()}`;
            el.querySelector(".js-ir")!.textContent = state.instruction.raw ?? state.instruction.text ?? "idle";
        },
        isActive: (state) => state.meta.stage === "FETCH"
    },
    {
        id: "decode",
        title: "DECODE",
        gridCol: "2",
        gridRow: "1",
        ports: [{ side: "left" }, { side: "bottom" }],
        template: `
            <div class="decode-grid">
                <span>OPCODE</span><strong class="js-op">NONE</strong>
                <span>REG 1</span><strong class="js-r1">-</strong>
                <span>REG 2</span><strong class="js-r2">-</strong>
            </div>`,
        render: (el, state) => {
            el.querySelector(".js-op")!.textContent = state.instruction.opcode ?? "NONE";
            el.querySelector(".js-r1")!.textContent = state.instruction.destinationRegister !== null ? `R${state.instruction.destinationRegister}` : "-";
            el.querySelector(".js-r2")!.textContent = state.instruction.sourceRegister !== null ? `R${state.instruction.sourceRegister}` : "-";
        },
        isActive: (state) => state.meta.stage === "DECODE"
    },
    {
        id: "mux",
        title: "MUX",
        gridCol: "3",
        gridRow: "1",
        ports: [{ side: "bottom" }, { side: "right" }],
        template: `
            <div class="mux-body">
                <div class="mux-select js-sel">SELECT = NONE</div>
            </div>`,
        render: (el, state) => {
            const op = state.datapath.alu.operation;
            el.querySelector(".js-sel")!.textContent = `SELECT = ${op}`;
            el.querySelector(".js-sel")!.classList.toggle("active", op !== "NONE" && state.datapath.alu.active);
        },
        isActive: (state) => state.meta.stage === "EXECUTE" && state.datapath.alu.active
    },
    {
        id: "alu",
        title: "ALU",
        gridCol: "4",
        gridRow: "1",
        ports: [{ side: "left" }, { side: "bottom" }],
        template: `
            <div class="alu-units">
                <div class="alu-unit" data-op="ADD"><span>ADD</span><b>+</b></div>
                <div class="alu-unit" data-op="SUB"><span>SUB</span><b>−</b></div>
                <div class="alu-unit" data-op="MUL"><span>MUL</span><b>×</b></div>
                <div class="alu-unit" data-op="DIV"><span>DIV</span><b>÷</b></div>
                <div class="alu-unit" data-op="CMP"><span>CMP</span><b>≡</b></div>
            </div>
            <div class="alu-operation">
                <span class="js-l">0</span>
                <b class="js-op">–</b>
                <span class="js-r">0</span>
            </div>
            <div class="alu-result js-res">idle</div>
            <div class="flags">
                <span class="js-z">Z 0</span><span class="js-n">N 0</span><span class="js-c">C 0</span><span class="js-v">V 0</span>
            </div>`,
        render: (el, state) => {
            const alu = state.datapath.alu;
            el.querySelectorAll(".alu-unit").forEach(unit => {
                const op = unit.getAttribute("data-op");
                unit.classList.toggle("active", alu.operation === op && alu.active);
            });
            el.querySelector(".js-l")!.textContent = alu.leftValue;
            el.querySelector(".js-r")!.textContent = alu.rightValue;
            el.querySelector(".js-op")!.textContent = ({ ADD: "+", SUB: "−", MUL: "×", DIV: "÷", CMP: "≡", NONE: "–" } as any)[alu.operation] ?? "–";
            el.querySelector(".js-res")!.textContent = alu.result;
            const f = state.flags;
            el.querySelector(".js-z")!.textContent = `Z ${f.equal ? 1 : 0}`;
            el.querySelector(".js-n")!.textContent = `N ${f.less ? 1 : 0}`;
            el.querySelector(".js-c")!.textContent = `C ${f.greater ? 1 : 0}`;
            el.querySelector(".js-v")!.textContent = `V 0`;
        },
        isActive: (state) => state.meta.stage === "EXECUTE" && state.datapath.blocks.alu.active
    },

    // ---- ROW 2 ----
    {
        id: "memory",
        title: "MEMORY",
        gridCol: "1",
        gridRow: "2",
        ports: [{ side: "top" }, { side: "right" }],
        template: `<div class="memory-list js-list"></div>`,
        render: (el, state) => {
            const list = el.querySelector(".js-list")!;
            list.innerHTML = "";
            for (const cell of state.memory) {
                const row = document.createElement("div");
                if (cell.active) row.classList.add("active");
                const addr = document.createElement("span");
                addr.textContent = `[${cell.address.toString().padStart(2, "0")}]`;
                const val = document.createElement("strong");
                val.textContent = cell.value;
                row.appendChild(addr);
                row.appendChild(val);
                list.appendChild(row);
            }
        },
        isActive: (state) => state.meta.stage === "EXECUTE" && state.datapath.blocks.memory.active
    },
    {
        id: "control",
        title: "CONTROL UNIT",
        gridCol: "2",
        gridRow: "2",
        ports: [{ side: "top" }, { side: "left" }, { side: "right" }],
        template: `
            <div class="control-signals">
                <div><span>ALU OP</span><strong class="js-alu">NONE</strong></div>
                <div><span>REG W</span><strong class="js-rw">0</strong></div>
                <div><span>MEM R</span><strong class="js-mr">0</strong></div>
                <div><span>MEM W</span><strong class="js-mw">0</strong></div>
            </div>`,
        render: (el, state) => {
            const s = state.signals;
            el.querySelector(".js-alu")!.textContent = state.instruction.opcode ?? "NONE";
            el.querySelector(".js-rw")!.textContent = s.registerWrite ? "1" : "0";
            el.querySelector(".js-mr")!.textContent = s.memoryRead ? "1" : "0";
            el.querySelector(".js-mw")!.textContent = s.memoryWrite ? "1" : "0";
        },
        isActive: (state) => state.meta.stage === "DECODE" || state.meta.stage === "EXECUTE"
    },
    {
        id: "registers",
        title: "REGISTERS",
        gridCol: "3",
        gridRow: "2",
        ports: [{ side: "left" }, { side: "top" }],
        template: `<div class="register-list js-list"></div>`,
        render: (el, state) => {
            const list = el.querySelector(".js-list")!;
            list.innerHTML = "";
            for (const register of state.registers) {
                const row = document.createElement("div");
                if (register.selected) row.classList.add("selected");
                if (register.active) row.classList.add("active");
                if (register.write) row.classList.add("write");
                if (register.read) row.classList.add("read");
                const name = document.createElement("span");
                name.textContent = register.name;
                const value = document.createElement("strong");
                value.textContent = register.value;
                row.appendChild(name);
                row.appendChild(value);
                list.appendChild(row);
            }
        },
        isActive: (state) => state.meta.stage === "EXECUTE" && state.datapath.blocks.registers.active
    },
    {
        id: "control-flow",
        title: "CONTROL FLOW",
        gridCol: "4",
        gridRow: "2",
        ports: [{ side: "top" }, { side: "bottom" }],
        template: `
            <div class="flow-options">
                <div class="flow halt js-h"><span>●</span> HALT</div>
                <div class="flow jump js-j"><span>↗</span> JMP → FETCH</div>
                <div class="flow branch js-b"><span>◆</span> BRANCH</div>
            </div>`,
        render: (el, state) => {
            el.querySelector(".js-h")!.classList.remove("active");
            el.querySelector(".js-j")!.classList.remove("active");
            el.querySelector(".js-b")!.classList.remove("active");
            if (state.signals.halt) el.querySelector(".js-h")!.classList.add("active");
            else if (state.signals.branchTaken) el.querySelector(".js-j")!.classList.add("active");
            else if (state.signals.branchEvaluate) el.querySelector(".js-b")!.classList.add("active");
        },
        isActive: (state) => state.meta.stage === "EXECUTE" && state.datapath.blocks.controlFlow.active
    }
];

// ---------------------------------------------------------
// Wires
// ---------------------------------------------------------

// Generate one parallel wire per ALU operation (MUX → ALU)
const MUX_ALU_WIRES: WireConfig[] = ALU_OPERATIONS.map((op, i) => ({
    id: `mux-alu-${op.toLowerCase()}`,
    fromBlock: "mux",
    fromPort: { side: "right" },
    toBlock: "alu",
    toPort: { side: "left" },
    routing: "parallel" as const,
    parallelIndex: i,
    parallelTotal: ALU_OPERATIONS.length,
    label: op,
    isActive: (s: any) =>
        s.meta.stage === "EXECUTE" &&
        s.datapath.alu.active &&
        s.datapath.alu.operation === op
}));

const WIRES: WireConfig[] = [
    // FETCH → DECODE
    {
        id: "fetch-decode",
        fromBlock: "fetch", fromPort: { side: "right" },
        toBlock: "decode", toPort: { side: "left" },
        routing: "straight",
        isActive: s => s.meta.stage === "FETCH" || s.meta.stage === "DECODE"
    },
    // FETCH → MEMORY
    {
        id: "fetch-memory",
        fromBlock: "fetch", fromPort: { side: "bottom" },
        toBlock: "memory", toPort: { side: "top" },
        routing: "straight",
        isActive: s => s.meta.stage === "FETCH"
    },
    // DECODE → CONTROL
    {
        id: "decode-control",
        fromBlock: "decode", fromPort: { side: "bottom" },
        toBlock: "control", toPort: { side: "top" },
        routing: "straight",
        isActive: s => s.meta.stage === "DECODE" || s.meta.stage === "EXECUTE"
    },
    // CONTROL → MEMORY  (LOAD / STORE)
    {
        id: "control-memory",
        fromBlock: "control", fromPort: { side: "left" },
        toBlock: "memory", toPort: { side: "right" },
        routing: "straight",
        isActive: s =>
            s.meta.stage === "EXECUTE" &&
            (s.signals.memoryRead || s.signals.memoryWrite)
    },
    // CONTROL → REGISTERS  (LOAD / STORE / ALU write-back)
    {
        id: "control-registers",
        fromBlock: "control", fromPort: { side: "right" },
        toBlock: "registers", toPort: { side: "left" },
        routing: "straight",
        isActive: s =>
            s.meta.stage === "EXECUTE" &&
            (s.signals.registerRead || s.signals.registerWrite)
    },
    // CONTROL → MUX  (ALU operations only)
    {
        id: "control-mux",
        fromBlock: "control", fromPort: { side: "right" },
        toBlock: "mux", toPort: { side: "bottom" },
        routing: "curve",
        isActive: s =>
            s.meta.stage === "EXECUTE" && s.datapath.alu.active
    },
    // MUX → ALU  (5 parallel wires, one per operation)
    ...MUX_ALU_WIRES,
    // ALU → REGISTERS  (write-back for ADD/SUB/MUL/DIV)
    {
        id: "alu-registers",
        fromBlock: "alu", fromPort: { side: "bottom" },
        toBlock: "registers", toPort: { side: "top" },
        routing: "curve",
        isActive: s =>
            s.meta.stage === "EXECUTE" &&
            s.signals.registerWrite && s.datapath.alu.active
    },
    // ALU → CONTROL-FLOW  (flags from CMP, or branch eval)
    {
        id: "alu-controlflow",
        fromBlock: "alu", fromPort: { side: "bottom" },
        toBlock: "control-flow", toPort: { side: "top" },
        routing: "straight",
        isActive: s =>
            s.meta.stage === "EXECUTE" &&
            (s.signals.flagsWrite || s.signals.branchEvaluate)
    },
    // CONTROL-FLOW → FETCH  (PC write-back loop)
    {
        id: "controlflow-fetch",
        fromBlock: "control-flow", fromPort: { side: "bottom" },
        toBlock: "fetch", toPort: { side: "bottom" },
        routing: "bottom-route",
        isActive: s =>
            s.meta.stage === "EXECUTE" && s.signals.pcWrite
    }
];

// ---------------------------------------------------------
// DOM refs
// ---------------------------------------------------------

const datapathEl = document.getElementById("datapath")!;
const svgEl = document.getElementById("wires")!;
const programDisplay = document.getElementById("program-display")!;
const programTextarea = document.querySelector<HTMLTextAreaElement>("#program-code")!;
const editBtn = document.querySelector<HTMLButtonElement>("#edit-program-btn")!;

// ---------------------------------------------------------
// Build static DOM
// ---------------------------------------------------------

function buildDom() {
    BLOCKS.forEach(cfg => {
        const div = document.createElement("div");
        div.className = `block ${cfg.id}`;
        div.id = `block-${cfg.id}`;
        div.style.gridColumn = cfg.gridCol;
        div.style.gridRow = cfg.gridRow;
        div.innerHTML = `<div class="block-title">${cfg.title}</div><div class="block-content">${cfg.template}</div>`;
        cfg.ports.forEach(p => {
            const port = document.createElement("span");
            port.className = `port port-${p.side}`;
            port.dataset.block = cfg.id;
            port.dataset.side = p.side;
            div.appendChild(port);
        });
        datapathEl.appendChild(div);
    });
}
buildDom();

// ---------------------------------------------------------
// Control Functions
// ---------------------------------------------------------

function runCPU(): void {
    if (running || cpu.isHalted()) return;
    running = true;
    document.querySelector(".status-dot")?.classList.remove("halted");
    scheduleNextCycle();
    render();
}

function pauseCPU(): void {
    running = false;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    render();
}

function scheduleNextCycle(): void {
    if (!running) return;
    timer = window.setTimeout(() => {
        executeCycle();
        scheduleNextCycle();
    }, cycleSpeed);
}

function executeCycle(): void {
    if (cpu.isHalted()) { pauseCPU(); return; }
    cpu.stepStage();
    render();
    if (cpu.isHalted()) pauseCPU();
}

function stepCPU(): void {
    if (running) pauseCPU();
    if (cpu.isHalted()) return;
    cpu.stepStage();
    render();
}

function resetCPU(): void {
    pauseCPU();
    cpu.reset();
    cpu.loadMemory(DEFAULT_MEMORY);
    render();
    drawWires();
}

// ---------------------------------------------------------
// SVG Wiring
// ---------------------------------------------------------

function drawWires(): void {
    svgEl.innerHTML = "";
    const rect = datapathEl.getBoundingClientRect();
    svgEl.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    svgEl.setAttribute("width", `${rect.width}`);
    svgEl.setAttribute("height", `${rect.height}`);

    WIRES.forEach(conn => {
        const fromEl = datapathEl.querySelector(`.port[data-block="${conn.fromBlock}"][data-side="${conn.fromPort.side}"]`) as HTMLElement;
        const toEl = datapathEl.querySelector(`.port[data-block="${conn.toBlock}"][data-side="${conn.toPort.side}"]`) as HTMLElement;

        if (!fromEl || !toEl) {
            console.warn(`[datapath] wire "${conn.id}" could not resolve a port:`, {
                from: `${conn.fromBlock}.${conn.fromPort.side}`,
                to: `${conn.toBlock}.${conn.toPort.side}`,
            });
            return;
        }

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        const x1 = fromRect.left - rect.left + fromRect.width / 2;
        const y1 = fromRect.top - rect.top + fromRect.height / 2;
        const x2 = toRect.left - rect.left + toRect.width / 2;
        const y2 = toRect.top - rect.top + toRect.height / 2;

        let d = "";
        let labelY = (y1 + y2) / 2;
        let labelX = (x1 + x2) / 2;

        if (conn.routing === "straight") {
            d = `M ${x1},${y1} L ${x2},${y2}`;
        } else if (conn.routing === "curve") {
            const dx = x2 - x1;
            const dy = y2 - y1;
            if (Math.abs(dy) > Math.abs(dx)) {
                const midY = (y1 + y2) / 2;
                d = `M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`;
            } else {
                const midX = (x1 + x2) / 2;
                d = `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
            }
        } else if (conn.routing === "bottom-route") {
            const offset = 20;
            const bottomY = rect.height - offset;
            d = `M ${x1},${y1} L ${x1},${bottomY} L ${x2},${bottomY} L ${x2},${y2}`;
        } else if (conn.routing === "parallel") {
            const total = conn.parallelTotal || 1;
            const index = conn.parallelIndex || 0;
            const spread = 14;
            const offset = (index - (total - 1) / 2) * spread;
            d = `M ${x1},${y1 + offset} L ${x2},${y2 + offset}`;
            labelY = (y1 + y2) / 2 + offset;
        }

        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("d", d);
        line.setAttribute("class", "wire");
        line.setAttribute("id", `wire-${conn.id}`);
        svgEl.appendChild(line);

        // Label for parallel wires
        if (conn.label) {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(labelX));
            text.setAttribute("y", String(labelY + 3));
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("class", "wire-label");
            text.setAttribute("id", `wire-label-${conn.id}`);
            text.textContent = conn.label;
            svgEl.appendChild(text);
        }
    });
    updateWires(cpu.getState());
}

function updateWires(state: any): void {
    WIRES.forEach(conn => {
        const wire = document.getElementById(`wire-${conn.id}`);
        if (wire) wire.classList.toggle("active", conn.isActive(state));
        const label = document.getElementById(`wire-label-${conn.id}`);
        if (label) label.classList.toggle("active", conn.isActive(state));
    });
}

// ---------------------------------------------------------
// Program Display (with current-instruction highlight)
// ---------------------------------------------------------

function renderProgram(state: any): void {
    if (editMode) return;

    programDisplay.innerHTML = "";
    for (const line of state.program.lines) {
        const div = document.createElement("div");
        div.className = "program-line";

        // During EXECUTE / HALTED the PC has already advanced, so use `executed`
        // to highlight the instruction that is currently being executed.
        const isCurrent =
            state.meta.stage === "EXECUTE" || state.meta.stage === "HALTED"
                ? line.executed
                : line.current;

        if (isCurrent) div.classList.add("current");
        if (line.index < state.program.pc) div.classList.add("done");

        const num = document.createElement("span");
        num.className = "line-num";
        num.textContent = String(line.index).padStart(2, "0");

        const text = document.createElement("span");
        text.className = "line-text";
        text.textContent = line.text;

        div.appendChild(num);
        div.appendChild(text);
        programDisplay.appendChild(div);
    }

    // Auto-scroll so the highlighted line stays centred
    const currentLine = programDisplay.querySelector(".program-line.current") as HTMLElement;
    if (currentLine) {
        const h = programDisplay.clientHeight;
        programDisplay.scrollTop = currentLine.offsetTop - h / 2 + currentLine.offsetHeight / 2;
    }
}

// ---------------------------------------------------------
// Render
// ---------------------------------------------------------

function render(): void {
    const state = cpu.getState();

    BLOCKS.forEach(cfg => {
        const el = document.getElementById(`block-${cfg.id}`);
        if (el) {
            el.classList.toggle("active", cfg.isActive(state));
            cfg.render(el, state);
        }
    });

    updateWires(state);
    renderProgram(state);

    // Footer
    const footer = document.querySelector(".cpu-footer")!;
    const fValues = footer.querySelectorAll("div strong");
    fValues[0].textContent = String(state.cycle.tick);
    fValues[1].textContent = `0x${state.program.pc.toString(16).padStart(4, "0").toUpperCase()}`;
    fValues[2].textContent = state.instruction.raw ?? state.instruction.text ?? "idle";
    fValues[3].textContent = state.meta.stage;

    const statusText = document.querySelector(".status-text")!;
    const statusDot = document.querySelector(".status-dot")!;
    statusText.textContent = state.meta.halted ? "HALTED" : state.meta.statusText ?? "READY";
    statusDot.classList.toggle("halted", state.meta.halted);
}

// ---------------------------------------------------------
// Events
// ---------------------------------------------------------

document.querySelector("#run-btn")?.addEventListener("click", runCPU);
document.querySelector("#pause-btn")?.addEventListener("click", pauseCPU);
document.querySelector("#step-btn")?.addEventListener("click", stepCPU);
document.querySelector("#reset-btn")?.addEventListener("click", resetCPU);

// --- Program edit / view toggle ---

function setEditMode(on: boolean) {
    editMode = on;
    if (on) {
        programTextarea.value = currentProgramText;
        programTextarea.style.display = "block";
        programDisplay.style.display = "none";
        editBtn.textContent = "VIEW";
    } else {
        programTextarea.style.display = "none";
        programDisplay.style.display = "block";
        editBtn.textContent = "EDIT";
        renderProgram(cpu.getState());
    }
}

editBtn.addEventListener("click", () => setEditMode(!editMode));

function loadDefaultProgram() {
    currentProgramText = DEFAULT_PROGRAM;
    programTextarea.value = DEFAULT_PROGRAM;
    localStorage.removeItem("vcpu_program");
    cpu.loadProgram(DEFAULT_PROGRAM.split("\n").filter(p => p.trim() !== ""));
    cpu.loadMemory(DEFAULT_MEMORY);
    setEditMode(false);
    resetCPU();
}

function loadCustomProgram() {
    const code = programTextarea.value;
    currentProgramText = code;
    localStorage.setItem("vcpu_program", code);
    cpu.loadProgram(code.split("\n").filter(p => p.trim() !== ""));
    cpu.loadMemory(DEFAULT_MEMORY);
    setEditMode(false);
    resetCPU();
}

document.querySelector("#load-default-btn")?.addEventListener("click", loadDefaultProgram);
document.querySelector("#load-custom-btn")?.addEventListener("click", loadCustomProgram);

// --- Speed slider ---

const speedSlider = document.querySelector<HTMLInputElement>("#cycle-speed")!;
const speedValue = document.querySelector<HTMLElement>("#cycle-speed-value")!;

speedSlider.addEventListener("input", () => {
    cycleSpeed = Number(speedSlider.value);
    speedValue.textContent = `${cycleSpeed} ms`;
    if (running && timer !== null) {
        clearTimeout(timer);
        scheduleNextCycle();
    }
});

window.addEventListener("resize", () => drawWires());

// ---------------------------------------------------------
// Startup
// ---------------------------------------------------------

const savedProgram = localStorage.getItem("vcpu_program");
if (savedProgram) {
    currentProgramText = savedProgram;
    programTextarea.value = savedProgram;
    cpu.loadProgram(savedProgram.split("\n").filter(p => p.trim() !== ""));
} else {
    currentProgramText = DEFAULT_PROGRAM;
    programTextarea.value = DEFAULT_PROGRAM;
    cpu.loadProgram(DEFAULT_PROGRAM.split("\n").filter(p => p.trim() !== ""));
}
cpu.loadMemory(DEFAULT_MEMORY);

setEditMode(false);

setTimeout(() => {
    render();
    drawWires();
}, 100);