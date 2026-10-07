// 어떤 값이든 텔레메트리·로그로 안전하게 실어보내기 위한 경계형 JSON 직렬화기.
//
// raw JSON.stringify 는 (1) 순환참조에서 throw 하고, (2) 값이 request/response 를 물고
// 있으면 헤더·토큰까지 통째로 빨아들이며, (3) Error 의 비열거 name/message/stack 을 놓친다.
// 이 모듈은 깊이·문자열/배열 길이 상한과 순환 가드를 두고, Error 는 비열거 속성까지 담아
// 항상 순수 JSON(직렬화 가능)을 반환한다. 의존성이 없어 workerd·브라우저·Node 어디서나 쓴다.

export interface SafeJsonOptions {
  /** cause/중첩 최대 깊이 (기본 5) */
  maxDepth?: number;
  /** 문자열 필드 최대 길이 (기본 4000) */
  maxStr?: number;
  /** 배열/객체 최대 항목 수 (기본 50) */
  maxItems?: number;
}

const DEFAULTS: Required<SafeJsonOptions> = {
  maxDepth: 5,
  maxStr: 4000,
  maxItems: 50,
};

/** 어떤 값이든 순환참조·과대 없이 순수 JSON 으로 안전 직렬화한다. 원시값은 그대로,
 * 문자열/배열/객체는 상한으로 자르고, Error 는 비열거 name/message/stack 을 명시 포함하며
 * cause(비열거 포함)와 own-enumerable 커스텀 필드(code/status 등)를 재귀로 담는다.
 * 함수/심볼은 드롭한다. 순환·깊이 초과 지점은 "[unserializable]" 로 대체한다. */
export const toSafeJson = (value: unknown, opts: SafeJsonOptions = {}): unknown => {
  const { maxDepth, maxStr, maxItems } = { ...DEFAULTS, ...opts };
  const cap = (s: string): string =>
    s.length > maxStr ? `${s.slice(0, maxStr)}…(truncated)` : s;

  const walk = (v: unknown, ctx: { depth: number; seen: WeakSet<object> }): unknown => {
    const { depth, seen } = ctx;
    if (v == null || typeof v === "boolean" || typeof v === "number") return v;
    if (typeof v === "string") return cap(v);
    if (typeof v === "bigint") return cap(v.toString());
    if (typeof v === "function" || typeof v === "symbol") return undefined;
    // 여기까지 오면 v 는 object 로 좁혀진다(위에서 원시·함수·심볼 전부 처리).
    if (seen.has(v) || depth <= 0) return "[unserializable]"; // 순환/깊이 초과
    seen.add(v);
    if (Array.isArray(v))
      return v.slice(0, maxItems).map((x) => walk(x, { depth: depth - 1, seen }));
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (v instanceof Error) {
      out.name = v.name;
      out.message = cap(v.message);
      if (v.stack) out.stack = cap(v.stack);
      // new Error(msg, { cause }) 의 cause 는 비열거라 Object.keys 에 안 잡힌다.
      const hasCause = "cause" in v;
      if (hasCause) {
        const cause = walk(v.cause, { depth: depth - 1, seen });
        const isCauseKept = cause !== undefined;
        if (isCauseKept) out.cause = cause;
      }
    }
    for (const k of Object.keys(src).slice(0, maxItems)) {
      const isDone = k in out; // Error 에서 이미 담은 stack/cause 등
      if (isDone) continue;
      const sv = walk(src[k], { depth: depth - 1, seen });
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  };

  return walk(value, { depth: maxDepth, seen: new WeakSet() });
};
