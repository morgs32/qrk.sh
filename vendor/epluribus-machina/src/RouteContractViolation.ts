import type {
  IRouteContractChannel,
  IRouteContractExpected,
  IRouteContractIssue
} from './types.js';

export class RouteContractViolation extends Error {
  readonly _tag = 'RouteContractViolation';
  readonly route: string;
  readonly state: string;
  readonly channel: IRouteContractChannel;
  readonly issue: IRouteContractIssue;
  declare readonly expected: IRouteContractExpected;
  declare readonly origin: unknown;
  declare readonly returned: unknown;

  constructor(props: {
    readonly route: string;
    readonly state: string;
    readonly origin: unknown;
    readonly channel: IRouteContractChannel;
    readonly expected: IRouteContractExpected;
    readonly issue: IRouteContractIssue;
    readonly returned: unknown;
  }) {
    const { channel, issue, origin, returned, route, state } = props;
    const expected = Array.isArray(props.expected)
      ? [...props.expected]
      : props.expected;
    super(
      `Route "${route}" violated its ${channel} contract from State "${state}" (${issue})`
    );
    this.name = 'RouteContractViolation';
    this.route = route;
    this.state = state;
    this.channel = channel;
    this.issue = issue;
    Object.defineProperties(this, {
      expected: { configurable: false, enumerable: false, value: expected },
      origin: { configurable: false, enumerable: false, value: origin },
      returned: { configurable: false, enumerable: false, value: returned }
    });
  }

  toJSON() {
    return {
      _tag: this._tag,
      route: this.route,
      state: this.state,
      channel: this.channel,
      issue: this.issue,
      expected:
        this.channel === 'success'
          ? this.expected
          : '<no failure>',
      message: this.message
    };
  }
}
