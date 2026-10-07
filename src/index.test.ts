import { describe, expect, test } from "vitest";
import { toSafeJson } from "./index";

describe("toSafeJson", () => {
  test("원시값은 그대로 통과", () => {
    expect(toSafeJson(1)).toBe(1);
    expect(toSafeJson("a")).toBe("a");
    expect(toSafeJson(true)).toBe(true);
    expect(toSafeJson(null)).toBe(null);
  });

  test("Error 의 비열거 name/message/stack + own 커스텀 필드 + cause 를 담는다", () => {
    const pg = Object.assign(new Error("closed"), { code: "08006" });
    const dz = Object.assign(new Error("Failed query: select ..."), {
      query: "select 1",
      params: ["a"],
      cause: pg,
    });
    const out = toSafeJson(dz) as Record<string, unknown>;
    expect(out.name).toBe("Error");
    expect(out.message).toBe("Failed query: select ...");
    expect(typeof out.stack).toBe("string");
    expect(out.query).toBe("select 1");
    expect((out.cause as Record<string, unknown>).code).toBe("08006");
  });

  test("new Error(msg, { cause }) 의 비열거 cause 도 담는다", () => {
    const out = toSafeJson(new Error("outer", { cause: new Error("inner") })) as Record<string, unknown>;
    expect((out.cause as Record<string, unknown>).message).toBe("inner");
  });

  test("순환참조를 throw 없이 처리하고 순수 JSON 을 반환", () => {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    let out: unknown;
    expect(() => {
      out = toSafeJson(a);
    }).not.toThrow();
    expect(() => JSON.stringify(out)).not.toThrow();
    expect((out as Record<string, unknown>).self).toBe("[unserializable]");
  });

  test("문자열·배열 상한을 적용", () => {
    const out = toSafeJson({
      s: "x".repeat(9000),
      arr: Array.from({ length: 200 }, (_, i) => i),
    }) as Record<string, unknown>;
    expect((out.s as string)).toMatch(/…\(truncated\)$/);
    expect((out.arr as unknown[]).length).toBe(50);
  });

  test("opts 로 상한을 조절할 수 있다", () => {
    const out = toSafeJson("abcdef", { maxStr: 3 }) as string;
    expect(out).toBe("abc…(truncated)");
  });

  test("함수/심볼은 드롭", () => {
    const out = toSafeJson({ fn: () => 1, ok: 2 }) as Record<string, unknown>;
    expect("fn" in out).toBe(false);
    expect(out.ok).toBe(2);
  });
});
