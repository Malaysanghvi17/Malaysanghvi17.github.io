import { getNumber } from "./utils/stringToNumber";
import type { Flags } from "./controlunit";
import { Register } from "./registers";

export class ALU {
    public add(oper1: Register, oper2: Register): Register {
        const result = getNumber(oper1.getValue()) + getNumber(oper2.getValue());
        return new Register(result.toString());
    }

    public sub(oper1: Register, oper2: Register): Register {
        const result = getNumber(oper1.getValue()) - getNumber(oper2.getValue());
        return new Register(result.toString());
    }

    public mul(oper1: Register, oper2: Register): Register {
        const result = getNumber(oper1.getValue()) * getNumber(oper2.getValue());
        return new Register(result.toString());
    }

    public div(oper1: Register, oper2: Register): Register {
        const divisor = getNumber(oper2.getValue());
        if (divisor === 0) throw new Error("Division by zero");
        const result = getNumber(oper1.getValue()) / divisor;
        return new Register(result.toString());
    }

    public cmp(oper1: Register, oper2: Register, cmpFlagReg: Flags): Flags {
        let lhs = getNumber(oper1.getValue());
        let rhs = getNumber(oper2.getValue());

        cmpFlagReg.equal = lhs === rhs;
        cmpFlagReg.greater = lhs > rhs;
        cmpFlagReg.less = lhs < rhs;
        return cmpFlagReg;
    }
}
