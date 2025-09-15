export class ServerError extends Error {
  public readonly name: string;
  public readonly status: number;
  public readonly code: string = 'UNKNOWN';

  constructor(status: number, message: string, cause?: unknown) {
    // if the error is already thrown from somewhere else
    // propagate it to not lose its error message
    if (cause instanceof ServerError) {
      throw cause;
    }

    super(message, { cause });

    this.status = status;
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause:
        this.cause instanceof Error && 'toJSON' in this.cause && typeof this.cause.toJSON === 'function'
          ? this.cause.toJSON()
          : this.cause?.toString(),
    };
  }
}

export class AddressNotFoundError extends ServerError {
  constructor(address: string, err?: unknown) {
    super(404, `Address ${address} could not be found.`, err);
  }
}

export class InsufficientBalanceError extends ServerError {
  constructor(address: string, available_balance: string, required_balance: string) {
    super(
      422,
      `Insufficient balance, requested ${required_balance} but have only ${available_balance} available on address ${address}.`,
    );
  }
}

export class CouldNotFindValidatorAddress extends ServerError {
  constructor(err: unknown) {
    super(404, 'Validator address could not be found.', err);
  }
}

export class CouldNotFindTxStatus extends ServerError {
  constructor() {
    super(404, 'Transaction could not be found.');
  }
}

export class CouldNotGetTxStatus extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error happened while getting the transaction status.', err);
  }
}

export class CouldNotBroadcastTx extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error happened while broadcasting the transaction.', err);
  }
}

export class CouldNotCraftTx extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error happened while crafting the transaction.', err);
  }
}

export class CouldNotPrepareTx extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error happened while preparing the transaction.', err);
  }
}

export class CouldNotDecodeTx extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error occurred while decoding the transaction.', err);
  }
}

export class CouldNotSignTx extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error occurred while signing the transaction.', err);
  }
}

export class CouldNotGetBalance extends ServerError {
  constructor(err: unknown) {
    super(500, 'An error happened while getting the address balance.', err);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: invariant
export function invariant(condition: any, message?: string): asserts condition {
  if (condition === false) {
    throw new Error(`Invariant failed: ${message}`);
  }
}
