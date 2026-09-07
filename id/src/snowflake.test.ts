import { test, expect } from "vitest";
import {
  snowflakeFactory,
  snowflake,
  snowflakeTime,
  isSnowflake,
  SNOWFLAKE_DEFAULT_EPOCH,
} from "./index";

test("snowflake ids increase over time and decode back to the timestamp", () => {
  let t = SNOWFLAKE_DEFAULT_EPOCH + 1000;
  const gen = snowflakeFactory({ machineId: 5, now: () => t });
  const a = gen();
  t += 1;
  const b = gen();
  t += 10;
  const c = gen();
  expect(BigInt(b) > BigInt(a)).toBe(true);
  expect(BigInt(c) > BigInt(b)).toBe(true);
  expect(snowflakeTime(a)).toBe(SNOWFLAKE_DEFAULT_EPOCH + 1000);
  expect(snowflakeTime(c)).toBe(SNOWFLAKE_DEFAULT_EPOCH + 1011);
});

test("snowflake sequence increments within one millisecond and stays ordered", () => {
  const t = SNOWFLAKE_DEFAULT_EPOCH + 5000;
  const gen = snowflakeFactory({ machineId: 0, now: () => t });
  const ids = Array.from({ length: 10 }, () => gen());
  expect(new Set(ids).size).toBe(10);
  for (let i = 1; i < ids.length; i++) {
    expect(BigInt(ids[i]!) > BigInt(ids[i - 1]!)).toBe(true);
  }
  // all share the same embedded timestamp
  for (const id of ids) expect(snowflakeTime(id)).toBe(t);
});

test("snowflake embeds the machine id in bits 12..21", () => {
  const t = SNOWFLAKE_DEFAULT_EPOCH + 1;
  const gen = snowflakeFactory({ machineId: 777, now: () => t });
  const id = gen();
  const machine = Number((BigInt(id) >> 12n) & 0x3ffn);
  expect(machine).toBe(777);
});

test("snowfakeFactory validates epoch and machineId", () => {
  expect(() => snowflakeFactory({ machineId: 2000 })).toThrow();
  expect(() => snowflakeFactory({ epoch: -1 })).toThrow();
});

test("isSnowflake validates decimal 64-bit strings", () => {
  expect(isSnowflake(snowflake())).toBe(true);
  expect(isSnowflake("123456789")).toBe(true);
  expect(isSnowflake("0")).toBe(true);
  expect(isSnowflake("-1")).toBe(false);
  expect(isSnowflake("abc")).toBe(false);
  expect(isSnowflake("99999999999999999999999")).toBe(false); // > 64 bit
});
