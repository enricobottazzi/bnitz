# bnitz: a minimal symbolic language

The prototype uses symbolic expressions and rewrite rules, inspired by [Wolfram Language](https://reference.wolfram.com/language/tutorial/PatternsAndTransformationRules.html).

## 1. Symbolic expressions

```text
HEAD[arguments]
```

A symbolic expression represents something or expresses a claim:

```text
SOMEONE["Alice"]
BEFORE[NOW[]]
DIE[SOMEONE["Alice"], BEFORE[NOW[]]]
```

The final expression claims that Alice died in the past. Writing it does not establish its truth.

## 2. Primitive expressions

These are the stopping points for reduction:

| Symbolic expression | Meaning |
| --- | --- |
| `SOMEONE["name"]` | The person named in the sentence; their identity may remain unresolved. |
| `NOW[]` | The present moment in the sentence's context. |
| `BEFORE[time]` | The period before the supplied time. |
| `DIE[person, time]` | The person dies at the supplied moment or sometime within the supplied period. |

This prototype demonstrates `BEFORE[NOW[]]`. Exact-date forms are not specified yet. `NOW[]` remains symbolic, with its meaning fixed by the sentence's context.

## 3. Rewrite rule

```text
DIED[person_SOMEONE, period_BEFORE: BEFORE[NOW[]]] :=
    DIE[person, period]
```

- `person_SOMEONE` matches an expression with head `SOMEONE`.
- `period_BEFORE` matches an expression with head `BEFORE`.
- `: BEFORE[NOW[]]` supplies the period when it is omitted.
- `:=` defines the rewrite.

Rules are stored and applied explicitly so that each step can be shown.

## 4. Pattern matching

A rewrite rule applies only when its pattern matches. Check the nested expressions too: `SOMEONE` contains a literal name, `NOW` has no arguments, and `BEFORE` contains a supported time expression.

```text
BEFORE[NOW[]]              // supported
BEFORE[SOMEONE["Alice"]]   // unsupported
```

These checks use the expressions' structure. No separate type-query mechanism is needed.

## 5. Reduction

An LLM translates the natural-language sentence into a symbolic expression. The reducer checks the expression's structure, applies a matching rewrite rule and its defaults, and records the result. This repeats until only declared primitives and literal data remain. An unsupported expression, missing definition, or circular rewrite produces `UNDEFINED`, showing where reduction stopped.

For “Alice died”:

```text
DIED[SOMEONE["Alice"]]
    → DIE[SOMEONE["Alice"], BEFORE[NOW[]]]
```

The rule matches the person expression and supplies the omitted period. The result contains only declared primitives, so reduction is complete. It expresses the claim that Alice died in the past; it does not prove it.

## 6. Truth assessment

After reduction, assess whether the reduced symbolic expression is valid, invalid, or undefined. The assessment procedure and the information it requires remain to be specified.
