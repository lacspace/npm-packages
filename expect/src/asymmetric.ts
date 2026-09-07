/**
 * Asymmetric matchers: `expect.any`, `expect.anything`, `expect.stringContaining`,
 * `expect.stringMatching`, `expect.arrayContaining`, `expect.objectContaining`
 * and `expect.closeTo`. Each is honored inside `toEqual`/`toMatchObject` because
 * it exposes an `asymmetricMatch` method (duck-typed by the equality engine).
 */

import { equals } from "./equals";
import type { AsymmetricMatcher, Constructor } from "./types";

abstract class BaseAsymmetric implements AsymmetricMatcher {
  constructor(protected readonly inverse = false) {}
  abstract asymmetricMatch(other: unknown): boolean;
  abstract toAsymmetricMatcher(): string;
  toString(): string {
    return this.toAsymmetricMatcher();
  }
}

class Any extends BaseAsymmetric {
  constructor(private readonly ctor: Constructor, inverse = false) {
    super(inverse);
    if (ctor == null) {
      throw new TypeError("expect.any(constructor) requires a constructor, got " + ctor);
    }
  }
  asymmetricMatch(other: unknown): boolean {
    let pass: boolean;
    switch (this.ctor as unknown) {
      case String:
        pass = typeof other === "string" || other instanceof String;
        break;
      case Number:
        pass = typeof other === "number" || other instanceof Number;
        break;
      case Boolean:
        pass = typeof other === "boolean" || other instanceof Boolean;
        break;
      case BigInt:
        pass = typeof other === "bigint";
        break;
      case Symbol:
        pass = typeof other === "symbol";
        break;
      case Function:
        pass = typeof other === "function";
        break;
      case Object:
        pass = other !== null && typeof other === "object";
        break;
      default:
        pass = other != null && other instanceof this.ctor;
    }
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    const name = (this.ctor as { name?: string }).name || "anonymous";
    return `${this.inverse ? "Not<" : ""}Any<${name}>${this.inverse ? ">" : ""}`;
  }
}

class Anything extends BaseAsymmetric {
  asymmetricMatch(other: unknown): boolean {
    const pass = other !== null && other !== undefined;
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    return "Anything";
  }
}

class StringContaining extends BaseAsymmetric {
  constructor(private readonly sample: string, inverse = false) {
    super(inverse);
    if (typeof sample !== "string") {
      throw new TypeError("expect.stringContaining expects a string");
    }
  }
  asymmetricMatch(other: unknown): boolean {
    const pass = typeof other === "string" && other.includes(this.sample);
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    return `StringContaining<${JSON.stringify(this.sample)}>`;
  }
}

class StringMatching extends BaseAsymmetric {
  private readonly re: RegExp;
  constructor(sample: string | RegExp, inverse = false) {
    super(inverse);
    if (!(typeof sample === "string" || sample instanceof RegExp)) {
      throw new TypeError("expect.stringMatching expects a string or RegExp");
    }
    this.re = typeof sample === "string" ? new RegExp(sample) : sample;
  }
  asymmetricMatch(other: unknown): boolean {
    const pass = typeof other === "string" && this.re.test(other);
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    return `StringMatching<${this.re.toString()}>`;
  }
}

class ArrayContaining extends BaseAsymmetric {
  constructor(private readonly sample: unknown[], inverse = false) {
    super(inverse);
    if (!Array.isArray(sample)) {
      throw new TypeError("expect.arrayContaining expects an array");
    }
  }
  asymmetricMatch(other: unknown): boolean {
    if (!Array.isArray(other)) return this.inverse;
    const pass = this.sample.every((s) => other.some((o) => equals(o, s)));
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    return `ArrayContaining`;
  }
}

class ObjectContaining extends BaseAsymmetric {
  constructor(private readonly sample: Record<string, unknown>, inverse = false) {
    super(inverse);
    if (sample === null || typeof sample !== "object") {
      throw new TypeError("expect.objectContaining expects an object");
    }
  }
  asymmetricMatch(other: unknown): boolean {
    if (other === null || typeof other !== "object") return this.inverse;
    const rec = other as Record<string, unknown>;
    let pass = true;
    for (const k of Object.keys(this.sample)) {
      if (!(k in rec) || !equals(rec[k], this.sample[k])) {
        pass = false;
        break;
      }
    }
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    return `ObjectContaining`;
  }
}

class CloseTo extends BaseAsymmetric {
  private readonly tolerance: number;
  constructor(private readonly sample: number, precision = 2, inverse = false) {
    super(inverse);
    if (typeof sample !== "number") throw new TypeError("expect.closeTo expects a number");
    this.tolerance = 0.5 * Math.pow(10, -precision);
  }
  asymmetricMatch(other: unknown): boolean {
    if (typeof other !== "number") return this.inverse;
    let pass: boolean;
    if (!Number.isFinite(other) || !Number.isFinite(this.sample)) {
      pass = Object.is(other, this.sample);
    } else {
      pass = Math.abs(this.sample - other) < this.tolerance;
    }
    return this.inverse ? !pass : pass;
  }
  toAsymmetricMatcher(): string {
    return `CloseTo<${this.sample}>`;
  }
}

/** Factory functions exposed on `expect` (and their `.not` inversions). */
export function makeAsymmetric(inverse: boolean) {
  return {
    any: (ctor: Constructor): AsymmetricMatcher => new Any(ctor, inverse),
    anything: (): AsymmetricMatcher => new Anything(inverse),
    stringContaining: (s: string): AsymmetricMatcher => new StringContaining(s, inverse),
    stringMatching: (s: string | RegExp): AsymmetricMatcher => new StringMatching(s, inverse),
    arrayContaining: (a: unknown[]): AsymmetricMatcher => new ArrayContaining(a, inverse),
    objectContaining: (o: Record<string, unknown>): AsymmetricMatcher =>
      new ObjectContaining(o, inverse),
    closeTo: (n: number, precision?: number): AsymmetricMatcher =>
      new CloseTo(n, precision, inverse),
  };
}
