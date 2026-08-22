export class Register {
    private value: string;
    constructor(value: string) {
        this.value = value;
    }
    public getValue(): string {
        return this.value;
    }
    public setValue(value: string) {
        this.value = value;
    }
}
