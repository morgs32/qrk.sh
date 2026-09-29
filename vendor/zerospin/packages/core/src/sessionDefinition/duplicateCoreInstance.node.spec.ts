import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/make/makeContractVersion.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';
import { makeReplica } from '../models/make/makeReplica.ts';

import { makeSessionDefinition } from './makeSessionDefinition.ts';

function makeSessionWithContract(contract: ReturnType<typeof makeAddBrick>) {
  return makeSessionDefinition({
    kind: 'aggregate',
    systemName: 'test',
    sessionName: 'test',
    aggregateName: 'test',
    aggregateVersion: '1.0.0',
    actorName: 'test',
    actorVersion: '1.0.0',
    claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
    models: {},
    contracts: { addBrick: contract },
  });
}

function makeAddBrick() {
  return makeContractVersion(defineContract('addBrick'), {
    version: '1.0.0',
    payload: {},
  });
}

function makeBrickModel() {
  return makeModelVersion(
    defineModel({ name: 'brick', abbreviation: 'brk' }),
    { version: '1.0.0', attributes: {}, indexes: [] },
  );
}

describe('duplicate core instance diagnostics', () => {
  it('accepts local contracts and models', () => {
    expect(makeSessionWithContract(makeAddBrick()).kind).toBe('aggregate');
    expect(
      makeReplica({
        sourceModel: makeBrickModel(),
        serviceName: 'test',
        serviceVersion: '1.0.0',
      }).modelName,
    ).toBe('brick');
  });

  it('identifies a foreign contract at the session boundary', () => {
    const contract = makeAddBrick();
    Object.setPrototypeOf(contract, Object.prototype);
    expect(() => makeSessionWithContract(contract)).toThrow(
      'Multiple copies of @zerospin/core are loaded: Contract "addBrick" was created by another copy',
    );
  });

  it('identifies a foreign model at a model boundary', () => {
    const model = makeBrickModel();
    Object.setPrototypeOf(model, Object.prototype);
    expect(() =>
      makeReplica({
        sourceModel: model,
        serviceName: 'test',
        serviceVersion: '1.0.0',
      }),
    ).toThrow(
      'Multiple copies of @zerospin/core are loaded: Model "brick" was created by another copy',
    );
  });

  it('retains the schema error for an unmarked invalid contract', () => {
    const contract = makeAddBrick();
    Object.setPrototypeOf(contract, Object.prototype);
    Reflect.deleteProperty(contract, Symbol.for('@zerospin/core/Contract'));
    expect(() => makeSessionWithContract(contract)).toThrow('Expected <Declaration>');
  });
});
