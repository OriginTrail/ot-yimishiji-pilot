class Command {
    constructor(ctx) {
        this.ctx = ctx;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     * @param transaction
     */
    async execute(command, transaction) {
        return Command.empty();
    }

    /**
     * Recover system from failure
     * @param command
     * @param err
     */
    async recover(command, err) {
        return Command.empty();
    }

    /**
     * Execute strategy when event is too late
     * @param command
     */
    async expired(command) {
        return Command.empty();
    }

    /**
     * Pack data for DB
     * @param data
     */
    pack(data) {
        return data;
    }

    /**
     * Unpack data from DB
     * @param data
     */
    unpack(data) {
        return data;
    }

    /**
     * Makes command from sequence and continues it
     * @param data
     * @param sequence
     */
    continueSequence(data, sequence) {
        if (!sequence || sequence.length === 0) {
            return Command.empty();
        }
        const [name] = sequence;
        sequence = sequence.slice(1);
        const handler = this.ctx[`${name}Command`];
        return {
            commands: [handler.constructor.buildDefault({
                data,
                sequence,
            })],
        };
    }

    /**
     * Halt execution
     * @returns {{repeat: boolean, commands: Array}}
     */
    static empty() {
        return {
            commands: [],
        };
    }

    /**
     * Returns repeat info
     * @returns {{repeat: boolean, commands: Array}}
     */
    static repeat() {
        return {
            repeat: true,
        };
    }
}

module.exports = Command;
